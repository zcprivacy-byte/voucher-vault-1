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
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from fastapi.responses import RedirectResponse
import io
import json as json_lib

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=False)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Initialize scheduler
scheduler = AsyncIOScheduler()

# Function to check and send reminders
async def check_and_send_reminders():
    """Check for expiring vouchers and send reminders"""
    try:
        # Get reminder settings
        settings_doc = await db.reminder_settings.find_one({"id": "reminder_settings"}, {"_id": 0})
        if not settings_doc:
            return
        
        settings = ReminderSettings(**settings_doc)
        
        # Get all vouchers
        vouchers = await db.vouchers.find({}, {"_id": 0}).to_list(1000)
        
        current_date = datetime.now(timezone.utc)
        reminders_to_send = []
        
        for voucher in vouchers:
            try:
                expiry_date = datetime.fromisoformat(voucher['expiry_date'])
                days_until_expiry = (expiry_date - current_date).days
                
                # Check if we should send a reminder
                if days_until_expiry in settings.reminder_days and days_until_expiry > 0:
                    reminders_to_send.append({
                        'voucher': voucher,
                        'days_left': days_until_expiry
                    })
            except:
                pass
        
        # Log reminders (in production, this would send emails/push notifications)
        if reminders_to_send:
            logger.info(f"Found {len(reminders_to_send)} vouchers expiring soon")
            
            # Store reminders in database for browser to fetch
            for reminder in reminders_to_send:
                await db.pending_reminders.insert_one({
                    "voucher_id": reminder['voucher']['id'],
                    "brand_name": reminder['voucher']['brand_name'],
                    "days_left": reminder['days_left'],
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
        
        # Update last check time
        await db.reminder_settings.update_one(
            {"id": "reminder_settings"},
            {"$set": {"last_check": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        
    except Exception as e:
        logger.error(f"Error checking reminders: {str(e)}")

# Models
class Voucher(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    brand_name: str
    discount_amount: str
    discount_value: Optional[str] = None
    currency: str = "USD"
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
    discount_value: Optional[str] = None
    currency: str = "USD"
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

class ReminderSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default="reminder_settings")
    email_enabled: bool = False
    email_address: Optional[str] = None
    browser_notifications_enabled: bool = True
    reminder_days: List[int] = [7, 3, 1]  # Days before expiry to send reminders
    default_currency: str = "USD"
    last_check: Optional[datetime] = None

class ReminderSettingsUpdate(BaseModel):
    email_enabled: bool
    email_address: Optional[str] = None
    browser_notifications_enabled: bool
    reminder_days: List[int]
    default_currency: str

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
async def get_vouchers(skip: int = 0, limit: int = 100):
    """Get vouchers with pagination"""
    vouchers = await db.vouchers.find({}, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
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
    """Get vouchers based on region or store name using optimized queries"""
    matching_vouchers = []
    
    # Build query based on location
    queries = [{"store_type": "international"}]
    
    if location.region:
        queries.append({
            "store_type": "regional",
            "region": {"$regex": location.region, "$options": "i"}
        })
    
    if location.store_name:
        queries.append({
            "store_type": "specific",
            "$or": [
                {"brand_name": {"$regex": location.store_name, "$options": "i"}},
                {"store_location": {"$regex": location.store_name, "$options": "i"}}
            ]
        })
    
    # Execute single query with $or
    vouchers = await db.vouchers.find(
        {"$or": queries},
        {"_id": 0}
    ).limit(100).to_list(100)
    
    for voucher in vouchers:
        if isinstance(voucher.get('created_at'), str):
            voucher['created_at'] = datetime.fromisoformat(voucher['created_at'])
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

@api_router.get("/reminder-settings", response_model=ReminderSettings)
async def get_reminder_settings():
    """Get user's reminder settings"""
    settings_doc = await db.reminder_settings.find_one({"id": "reminder_settings"}, {"_id": 0})
    
    if not settings_doc:
        # Return default settings
        default_settings = ReminderSettings()
        return default_settings
    
    if isinstance(settings_doc.get('last_check'), str):
        settings_doc['last_check'] = datetime.fromisoformat(settings_doc['last_check'])
    
    return ReminderSettings(**settings_doc)

@api_router.post("/reminder-settings")
async def update_reminder_settings(settings: ReminderSettingsUpdate):
    """Update user's reminder settings"""
    settings_dict = settings.model_dump()
    
    await db.reminder_settings.update_one(
        {"id": "reminder_settings"},
        {"$set": settings_dict},
        upsert=True
    )
    
    return {"message": "Reminder settings updated successfully"}

@api_router.get("/pending-reminders")
async def get_pending_reminders():
    """Get pending reminders for the user"""
    reminders = await db.pending_reminders.find({}, {"_id": 0}).to_list(100)
    
    # Clear fetched reminders
    if reminders:
        await db.pending_reminders.delete_many({})
    
    return {"reminders": reminders}

@api_router.get("/drive/connect")
async def connect_drive():
    """Initiate Google Drive OAuth flow"""
    try:
        client_id = os.getenv("GOOGLE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        frontend_url = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")[0]
        redirect_uri = f"{frontend_url}/api/drive/callback"
        
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [redirect_uri]
                }
            },
            scopes=['https://www.googleapis.com/auth/drive.file'],
            redirect_uri=redirect_uri
        )
        
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent'
        )
        
        # Store state for validation
        await db.oauth_states.insert_one({
            "state": state,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return {"authorization_url": authorization_url}
    
    except Exception as e:
        logger.error(f"Failed to initiate OAuth: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to initiate OAuth: {str(e)}")

@api_router.get("/drive/callback")
async def drive_callback(code: str, state: str):
    """Handle Google Drive OAuth callback"""
    try:
        # Verify state
        state_doc = await db.oauth_states.find_one({"state": state})
        if not state_doc:
            raise HTTPException(status_code=400, detail="Invalid state")
        
        client_id = os.getenv("GOOGLE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        frontend_url = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")[0]
        redirect_uri = f"{frontend_url}/api/drive/callback"
        
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [redirect_uri]
                }
            },
            scopes=None,
            redirect_uri=redirect_uri
        )
        
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        # Store credentials
        await db.drive_credentials.update_one(
            {"user_id": "default"},
            {"$set": {
                "user_id": "default",
                "access_token": credentials.token,
                "refresh_token": credentials.refresh_token,
                "token_uri": credentials.token_uri,
                "client_id": credentials.client_id,
                "client_secret": credentials.client_secret,
                "scopes": credentials.scopes,
                "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )
        
        # Clean up state
        await db.oauth_states.delete_one({"state": state})
        
        return RedirectResponse(url=f"{frontend_url}?drive_connected=true")
    
    except Exception as e:
        logger.error(f"OAuth callback failed: {str(e)}")
        raise HTTPException(status_code=400, detail=f"OAuth failed: {str(e)}")

async def get_drive_service():
    """Get Google Drive service with auto-refresh credentials"""
    creds_doc = await db.drive_credentials.find_one({"user_id": "default"})
    if not creds_doc:
        return None
    
    creds = Credentials(
        token=creds_doc["access_token"],
        refresh_token=creds_doc.get("refresh_token"),
        token_uri=creds_doc["token_uri"],
        client_id=creds_doc["client_id"],
        client_secret=creds_doc["client_secret"],
        scopes=creds_doc["scopes"]
    )
    
    # Auto-refresh if expired
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
        await db.drive_credentials.update_one(
            {"user_id": "default"},
            {"$set": {
                "access_token": creds.token,
                "expiry": creds.expiry.isoformat() if creds.expiry else None,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    return build('drive', 'v3', credentials=creds)

@api_router.post("/drive/sync")
async def sync_to_drive():
    """Sync vouchers to Google Drive"""
    try:
        service = await get_drive_service()
        if not service:
            raise HTTPException(status_code=400, detail="Google Drive not connected")
        
        # Get all vouchers
        vouchers = await db.vouchers.find({}, {"_id": 0}).to_list(1000)
        
        # Convert to JSON
        data = {
            "vouchers": vouchers,
            "synced_at": datetime.now(timezone.utc).isoformat()
        }
        
        json_str = json_lib.dumps(data, indent=2, default=str)
        file_metadata = {
            'name': 'vouchervault_backup.json',
            'mimeType': 'application/json'
        }
        
        media = MediaIoBaseUpload(
            io.BytesIO(json_str.encode('utf-8')),
            mimetype='application/json',
            resumable=True
        )
        
        # Check if file exists
        results = service.files().list(
            q="name='vouchervault_backup.json' and trashed=false",
            spaces='drive',
            fields='files(id, name)'
        ).execute()
        
        files = results.get('files', [])
        
        if files:
            # Update existing file
            file_id = files[0]['id']
            service.files().update(
                fileId=file_id,
                media_body=media
            ).execute()
        else:
            # Create new file
            service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id'
            ).execute()
        
        # Update sync status
        await db.sync_status.update_one(
            {"service": "google_drive"},
            {"$set": {
                "service": "google_drive",
                "last_sync": datetime.now(timezone.utc).isoformat(),
                "status": "success",
                "voucher_count": len(vouchers)
            }},
            upsert=True
        )
        
        return {
            "success": True,
            "message": f"Synced {len(vouchers)} vouchers to Google Drive",
            "synced_at": datetime.now(timezone.utc).isoformat()
        }
    
    except Exception as e:
        logger.error(f"Drive sync failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

@api_router.get("/drive/status")
async def get_drive_status():
    """Get Google Drive connection and sync status"""
    creds_doc = await db.drive_credentials.find_one({"user_id": "default"})
    sync_doc = await db.sync_status.find_one({"service": "google_drive"})
    
    return {
        "connected": creds_doc is not None,
        "last_sync": sync_doc.get("last_sync") if sync_doc else None,
        "voucher_count": sync_doc.get("voucher_count") if sync_doc else 0
    }

@api_router.post("/drive/disconnect")
async def disconnect_drive():
    """Disconnect Google Drive"""
    await db.drive_credentials.delete_one({"user_id": "default"})
    await db.sync_status.delete_one({"service": "google_drive"})
    return {"success": True, "message": "Google Drive disconnected"}

@app.on_event("startup")
async def startup_event():
    # Start the scheduler
    scheduler.add_job(
        check_and_send_reminders,
        IntervalTrigger(hours=6),  # Check every 6 hours
        id='reminder_checker',
        replace_existing=True
    )
    scheduler.start()
    logger.info("Reminder scheduler started")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()