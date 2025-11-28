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