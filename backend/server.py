from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import math
import base64
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Models
class Voucher(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    brand_name: str
    discount_amount: str
    voucher_code: str
    expiry_date: str
    store_type: str = "international"  # specific, regional, international
    redemption_type: str = "both"  # online, offline, both
    store_location: Optional[str] = None
    region: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class VoucherCreate(BaseModel):
    brand_name: str
    discount_amount: str
    voucher_code: str
    expiry_date: str
    store_type: str = "international"
    redemption_type: str = "both"
    store_location: Optional[str] = None
    region: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None

class LocationCheckIn(BaseModel):
    region: Optional[str] = None
    store_name: Optional[str] = None

class ImageScanRequest(BaseModel):
    image_base64: str

# Routes
@api_router.get("/")
async def root():
    return {"message": "Voucher Management API"}

@api_router.post("/vouchers", response_model=Voucher)
async def create_voucher(voucher_input: VoucherCreate):
    voucher_dict = voucher_input.model_dump()
    voucher_obj = Voucher(**voucher_dict)
    
    doc = voucher_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.vouchers.insert_one(doc)
    return voucher_obj

@api_router.get("/vouchers", response_model=List[Voucher])
async def get_vouchers():
    vouchers = await db.vouchers.find({}, {"_id": 0}).to_list(1000)
    
    for voucher in vouchers:
        if isinstance(voucher.get('created_at'), str):
            voucher['created_at'] = datetime.fromisoformat(voucher['created_at'])
    
    return vouchers

@api_router.get("/vouchers/expiring-soon", response_model=List[Voucher])
async def get_expiring_vouchers(days: int = 7):
    """Get vouchers expiring within specified days"""
    vouchers = await db.vouchers.find({}, {"_id": 0}).to_list(1000)
    
    current_date = datetime.now(timezone.utc)
    threshold_date = current_date + timedelta(days=days)
    
    expiring_vouchers = []
    for voucher in vouchers:
        if isinstance(voucher.get('created_at'), str):
            voucher['created_at'] = datetime.fromisoformat(voucher['created_at'])
        
        try:
            expiry_date = datetime.fromisoformat(voucher['expiry_date'])
            if current_date <= expiry_date <= threshold_date:
                expiring_vouchers.append(voucher)
        except:
            pass
    
    return expiring_vouchers

@api_router.post("/vouchers/nearby", response_model=List[Voucher])
async def get_nearby_vouchers(location: LocationCheckIn):
    """Get vouchers based on region or store name"""
    vouchers = await db.vouchers.find({}, {"_id": 0}).to_list(1000)
    
    matching_vouchers = []
    for voucher in vouchers:
        if isinstance(voucher.get('created_at'), str):
            voucher['created_at'] = datetime.fromisoformat(voucher['created_at'])
        
        # International vouchers are always available
        if voucher.get('store_type') == 'international':
            matching_vouchers.append(voucher)
            continue
        
        # Regional vouchers - match by region
        if voucher.get('store_type') == 'regional' and location.region:
            if voucher.get('region') and location.region.lower() in voucher.get('region', '').lower():
                matching_vouchers.append(voucher)
                continue
        
        # Specific store vouchers - match by store name or location
        if voucher.get('store_type') == 'specific' and location.store_name:
            brand_match = location.store_name.lower() in voucher.get('brand_name', '').lower()
            location_match = voucher.get('store_location') and location.store_name.lower() in voucher.get('store_location', '').lower()
            
            if brand_match or location_match:
                matching_vouchers.append(voucher)
    
    return matching_vouchers

@api_router.delete("/vouchers/{voucher_id}")
async def delete_voucher(voucher_id: str):
    result = await db.vouchers.delete_one({"id": voucher_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Voucher not found")
    
    return {"message": "Voucher deleted successfully"}

@api_router.get("/vouchers/stats")
async def get_voucher_stats():
    """Get statistics about vouchers"""
    all_vouchers = await db.vouchers.find({}, {"_id": 0}).to_list(1000)
    
    current_date = datetime.now(timezone.utc)
    
    total = len(all_vouchers)
    expired = 0
    expiring_soon = 0
    active = 0
    
    for voucher in all_vouchers:
        try:
            expiry_date = datetime.fromisoformat(voucher['expiry_date'])
            if expiry_date < current_date:
                expired += 1
            elif expiry_date <= current_date + timedelta(days=7):
                expiring_soon += 1
            else:
                active += 1
        except:
            pass
    
    return {
        "total": total,
        "active": active,
        "expired": expired,
        "expiring_soon": expiring_soon
    }

@api_router.post("/vouchers/scan-image")
async def scan_voucher_image(request: ImageScanRequest):
    """Scan and extract voucher details from receipt or coupon image"""
    try:
        # Initialize LLM chat
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=f"scan-{datetime.now().timestamp()}",
            system_message="You are an expert at extracting voucher and coupon information from images. Extract all relevant details accurately."
        ).with_model("openai", "gpt-4o-mini")
        
        # Create image content
        image_content = ImageContent(image_base64=request.image_base64)
        
        # Create message with image
        user_message = UserMessage(
            text="""Analyze this receipt or coupon image and extract the following information in JSON format:
            {
                "brand_name": "store or brand name",
                "discount_amount": "discount value (e.g., 20% OFF, $10 OFF)",
                "voucher_code": "coupon/voucher code if visible",
                "expiry_date": "expiry date in YYYY-MM-DD format if visible",
                "category": "product category (e.g., Food, Fashion, Electronics)",
                "description": "any additional terms or conditions"
            }
            
            If any field is not visible or unclear in the image, set it to null.
            Return ONLY the JSON object, no additional text.""",
            file_contents=[image_content]
        )
        
        # Get response from LLM
        response = await chat.send_message(user_message)
        
        # Parse the JSON response
        import json
        # Clean the response - remove markdown code blocks if present
        response_text = response.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()
        
        extracted_data = json.loads(response_text)
        
        return {
            "success": True,
            "extracted_data": extracted_data
        }
        
    except Exception as e:
        logger.error(f"Error scanning image: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to scan image: {str(e)}")

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()