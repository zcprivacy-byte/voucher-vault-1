import { useState, useEffect } from "react";
import "@/App.css";
import axios from "axios";
import { Ticket, MapPin, Bell, Plus, Trash2, Search, TrendingUp, Calendar, Tag, Globe, Store, Upload, Camera, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [vouchers, setVouchers] = useState([]);
  const [expiringVouchers, setExpiringVouchers] = useState([]);
  const [nearbyVouchers, setNearbyVouchers] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, expired: 0, expiring_soon: 0 });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [userLocation, setUserLocation] = useState(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [reminderSettings, setReminderSettings] = useState({
    email_enabled: false,
    email_address: "",
    browser_notifications_enabled: true,
    reminder_days: [7, 3, 1]
  });
  const [notificationPermission, setNotificationPermission] = useState("default");

  const [newVoucher, setNewVoucher] = useState({
    brand_name: "",
    discount_amount: "",
    voucher_code: "",
    expiry_date: "",
    store_type: "international",
    redemption_type: "both",
    store_location: "",
    region: "",
    category: "",
    description: ""
  });

  useEffect(() => {
    fetchVouchers();
    fetchExpiringVouchers();
    fetchStats();
    fetchReminderSettings();
    checkNotificationPermission();
    checkPendingReminders();
    
    // Check for reminders every 5 minutes
    const reminderInterval = setInterval(checkPendingReminders, 5 * 60 * 1000);
    
    return () => clearInterval(reminderInterval);
  }, []);

  const fetchVouchers = async () => {
    try {
      const response = await axios.get(`${API}/vouchers`);
      setVouchers(response.data);
    } catch (error) {
      toast.error("Failed to fetch vouchers");
    }
  };

  const fetchExpiringVouchers = async () => {
    try {
      const response = await axios.get(`${API}/vouchers/expiring-soon?days=7`);
      setExpiringVouchers(response.data);
    } catch (error) {
      console.error("Failed to fetch expiring vouchers", error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/vouchers/stats`);
      setStats(response.data);
    } catch (error) {
      console.error("Failed to fetch stats", error);
    }
  };

  const handleAddVoucher = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/vouchers`, newVoucher);
      toast.success("Voucher added successfully!");
      setIsAddDialogOpen(false);
      setNewVoucher({
        brand_name: "",
        discount_amount: "",
        voucher_code: "",
        expiry_date: "",
        store_type: "international",
        redemption_type: "both",
        store_location: "",
        region: "",
        category: "",
        description: ""
      });
      fetchVouchers();
      fetchExpiringVouchers();
      fetchStats();
    } catch (error) {
      toast.error("Failed to add voucher");
    }
  };

  const handleDeleteVoucher = async (voucherId) => {
    try {
      await axios.delete(`${API}/vouchers/${voucherId}`);
      toast.success("Voucher deleted successfully!");
      fetchVouchers();
      fetchExpiringVouchers();
      fetchStats();
    } catch (error) {
      toast.error("Failed to delete voucher");
    }
  };

  const handleCheckIn = async () => {
    setIsCheckingIn(true);
    
    // Prompt user for store/region info
    const storeName = prompt("Enter store name or brand (leave empty to search by region):");
    
    if (storeName === null) {
      setIsCheckingIn(false);
      return;
    }
    
    let region = null;
    if (!storeName) {
      region = prompt("Enter your region/city (e.g., New York, California):");
      if (region === null) {
        setIsCheckingIn(false);
        return;
      }
    }
    
    try {
      const response = await axios.post(`${API}/vouchers/nearby`, {
        store_name: storeName || null,
        region: region || null
      });
      setNearbyVouchers(response.data);
      
      if (response.data.length > 0) {
        toast.success(`Found ${response.data.length} voucher(s) available!`);
      } else {
        toast.info("No vouchers available for this location");
      }
    } catch (error) {
      toast.error("Failed to find vouchers");
    }
    
    setIsCheckingIn(false);
  };

  const filteredVouchers = vouchers.filter(voucher => 
    voucher.brand_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    voucher.voucher_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (voucher.category && voucher.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const isExpired = (expiryDate) => {
    return new Date(expiryDate) < new Date();
  };

  const getDaysUntilExpiry = (expiryDate) => {
    const days = Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const fetchReminderSettings = async () => {
    try {
      const response = await axios.get(`${API}/reminder-settings`);
      setReminderSettings(response.data);
    } catch (error) {
      console.error("Failed to fetch reminder settings", error);
    }
  };

  const checkNotificationPermission = () => {
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  };

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        toast.success("Browser notifications enabled!");
      }
    }
  };

  const checkPendingReminders = async () => {
    try {
      const response = await axios.get(`${API}/pending-reminders`);
      const reminders = response.data.reminders;
      
      if (reminders && reminders.length > 0 && reminderSettings.browser_notifications_enabled) {
        reminders.forEach(reminder => {
          showBrowserNotification(
            `${reminder.brand_name} voucher expiring soon!`,
            `Your voucher expires in ${reminder.days_left} day(s). Don't miss out!`
          );
        });
      }
    } catch (error) {
      console.error("Failed to check pending reminders", error);
    }
  };

  const showBrowserNotification = (title, body) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, {
        body: body,
        icon: "/favicon.ico",
        badge: "/favicon.ico"
      });
    }
  };

  const handleSaveReminderSettings = async () => {
    try {
      await axios.post(`${API}/reminder-settings`, reminderSettings);
      toast.success("Reminder settings saved!");
      setIsSettingsOpen(false);
    } catch (error) {
      toast.error("Failed to save settings");
    }
  };

  const toggleReminderDay = (day) => {
    setReminderSettings(prev => {
      const days = prev.reminder_days.includes(day)
        ? prev.reminder_days.filter(d => d !== day)
        : [...prev.reminder_days, day].sort((a, b) => b - a);
      return { ...prev, reminder_days: days };
    });
  };

  const handleImageScan = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }
    
    setIsScanning(true);
    
    try {
      // Convert image to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result.split(',')[1]; // Remove data:image/...;base64, prefix
        
        try {
          const response = await axios.post(`${API}/vouchers/scan-image`, {
            image_base64: base64String
          });
          
          if (response.data.success && response.data.extracted_data) {
            const extracted = response.data.extracted_data;
            
            // Pre-fill the form with extracted data
            setNewVoucher({
              brand_name: extracted.brand_name || "",
              discount_amount: extracted.discount_amount || "",
              voucher_code: extracted.voucher_code || "",
              expiry_date: extracted.expiry_date || "",
              store_type: "international",
              redemption_type: "both",
              store_location: "",
              region: "",
              category: extracted.category || "",
              description: extracted.description || ""
            });
            
            setIsAddDialogOpen(true);
            toast.success("Image scanned! Review and save the voucher.");
          }
        } catch (error) {
          toast.error("Failed to scan image. Please try again.");
        } finally {
          setIsScanning(false);
        }
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error("Failed to read image file");
      setIsScanning(false);
    }
  };

  return (
    <div className="App">
      <Toaster position="top-center" richColors />
      
      <div className="hero-section">
        <Button
          data-testid="settings-btn"
          size="icon"
          variant="ghost"
          className="settings-btn"
          onClick={() => setIsSettingsOpen(true)}
        >
          <Settings size={24} />
        </Button>
        
        <div className="hero-content">
          <div className="hero-icon">
            <Ticket size={48} />
          </div>
          <h1 className="hero-title">VoucherVault</h1>
          <p className="hero-subtitle">Never miss a discount. Store, track, and redeem your vouchers effortlessly.</p>
          
          <div className="hero-actions">
            <input
              type="file"
              id="image-upload"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageScan}
            />
            
            <Button 
              data-testid="scan-voucher-btn"
              size="lg" 
              className="scan-voucher-btn"
              onClick={() => document.getElementById('image-upload').click()}
              disabled={isScanning}
            >
              {isScanning ? (
                <>
                  <Upload size={20} className="animate-pulse" /> Scanning...
                </>
              ) : (
                <>
                  <Camera size={20} /> Scan Receipt/Coupon
                </>
              )}
            </Button>
            
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-voucher-btn" size="lg" className="add-voucher-btn">
                  <Plus size={20} /> Add Manually
                </Button>
              </DialogTrigger>
              <DialogContent className="dialog-content">
                <DialogHeader>
                  <DialogTitle>Add New Voucher</DialogTitle>
                  <DialogDescription>
                    Fill in the voucher details to save it to your vault
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddVoucher} className="voucher-form">
                  <div className="form-group">
                    <Label htmlFor="brand_name">Brand Name *</Label>
                    <Input
                      id="brand_name"
                      data-testid="brand-name-input"
                      required
                      value={newVoucher.brand_name}
                      onChange={(e) => setNewVoucher({...newVoucher, brand_name: e.target.value})}
                      placeholder="e.g., Starbucks, Nike, Amazon"
                    />
                  </div>
                  
                  <div className="form-group">
                    <Label htmlFor="discount_amount">Discount Amount *</Label>
                    <Input
                      id="discount_amount"
                      data-testid="discount-amount-input"
                      required
                      value={newVoucher.discount_amount}
                      onChange={(e) => setNewVoucher({...newVoucher, discount_amount: e.target.value})}
                      placeholder="e.g., 20% OFF, $10 OFF"
                    />
                  </div>
                  
                  <div className="form-group">
                    <Label htmlFor="voucher_code">Voucher Code *</Label>
                    <Input
                      id="voucher_code"
                      data-testid="voucher-code-input"
                      required
                      value={newVoucher.voucher_code}
                      onChange={(e) => setNewVoucher({...newVoucher, voucher_code: e.target.value})}
                      placeholder="e.g., SAVE20"
                    />
                  </div>
                  
                  <div className="form-group">
                    <Label htmlFor="expiry_date">Expiry Date *</Label>
                    <Input
                      id="expiry_date"
                      data-testid="expiry-date-input"
                      type="date"
                      required
                      value={newVoucher.expiry_date}
                      onChange={(e) => setNewVoucher({...newVoucher, expiry_date: e.target.value})}
                    />
                  </div>
                  
                  <div className="form-group">
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      data-testid="category-input"
                      value={newVoucher.category}
                      onChange={(e) => setNewVoucher({...newVoucher, category: e.target.value})}
                      placeholder="e.g., Food, Fashion, Electronics"
                    />
                  </div>
                  
                  <div className="form-group">
                    <Label>How can this voucher be redeemed? *</Label>
                    <div className="radio-group">
                      <label className="radio-label">
                        <input
                          type="radio"
                          data-testid="redemption-type-both"
                          name="redemption_type"
                          value="both"
                          checked={newVoucher.redemption_type === "both"}
                          onChange={(e) => setNewVoucher({...newVoucher, redemption_type: e.target.value})}
                        />
                        <span>Both Online & Offline</span>
                      </label>
                      
                      <label className="radio-label">
                        <input
                          type="radio"
                          data-testid="redemption-type-online"
                          name="redemption_type"
                          value="online"
                          checked={newVoucher.redemption_type === "online"}
                          onChange={(e) => setNewVoucher({...newVoucher, redemption_type: e.target.value})}
                        />
                        <span>Online Only</span>
                      </label>
                      
                      <label className="radio-label">
                        <input
                          type="radio"
                          data-testid="redemption-type-offline"
                          name="redemption_type"
                          value="offline"
                          checked={newVoucher.redemption_type === "offline"}
                          onChange={(e) => setNewVoucher({...newVoucher, redemption_type: e.target.value})}
                        />
                        <span>Offline/In-Store Only</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <Label>Where can this voucher be used? *</Label>
                    <div className="radio-group">
                      <label className="radio-label">
                        <input
                          type="radio"
                          data-testid="store-type-international"
                          name="store_type"
                          value="international"
                          checked={newVoucher.store_type === "international"}
                          onChange={(e) => setNewVoucher({...newVoucher, store_type: e.target.value})}
                        />
                        <span>International - Can be used anywhere</span>
                      </label>
                      
                      <label className="radio-label">
                        <input
                          type="radio"
                          data-testid="store-type-regional"
                          name="store_type"
                          value="regional"
                          checked={newVoucher.store_type === "regional"}
                          onChange={(e) => setNewVoucher({...newVoucher, store_type: e.target.value})}
                        />
                        <span>Regional - Specific region/city only</span>
                      </label>
                      
                      <label className="radio-label">
                        <input
                          type="radio"
                          data-testid="store-type-specific"
                          name="store_type"
                          value="specific"
                          checked={newVoucher.store_type === "specific"}
                          onChange={(e) => setNewVoucher({...newVoucher, store_type: e.target.value})}
                        />
                        <span>Specific Store - One location only</span>
                      </label>
                    </div>
                  </div>
                  
                  {newVoucher.store_type === "regional" && (
                    <div className="form-group">
                      <Label htmlFor="region">Region/City *</Label>
                      <Input
                        id="region"
                        data-testid="region-input"
                        required
                        value={newVoucher.region}
                        onChange={(e) => setNewVoucher({...newVoucher, region: e.target.value})}
                        placeholder="e.g., New York, California, London"
                      />
                    </div>
                  )}
                  
                  {newVoucher.store_type === "specific" && (
                    <div className="form-group">
                      <Label htmlFor="store_location">Store Address *</Label>
                      <Input
                        id="store_location"
                        data-testid="store-location-input"
                        required
                        value={newVoucher.store_location}
                        onChange={(e) => setNewVoucher({...newVoucher, store_location: e.target.value})}
                        placeholder="e.g., 123 Main St, New York, NY 10001"
                      />
                    </div>
                  )}
                  
                  <div className="form-group">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      data-testid="description-input"
                      value={newVoucher.description}
                      onChange={(e) => setNewVoucher({...newVoucher, description: e.target.value})}
                      placeholder="Any additional details..."
                    />
                  </div>
                  
                  <Button data-testid="submit-voucher-btn" type="submit" className="submit-btn">Save Voucher</Button>
                </form>
              </DialogContent>
            </Dialog>
            
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogContent className="dialog-content">
                <DialogHeader>
                  <DialogTitle>Reminder Settings</DialogTitle>
                  <DialogDescription>
                    Configure how you want to be reminded about expiring vouchers
                  </DialogDescription>
                </DialogHeader>
                
                <div className="settings-form">
                  <div className="settings-section">
                    <h3 className="settings-heading">Browser Notifications</h3>
                    <div className="settings-item">
                      <label className="switch-label">
                        <input
                          type="checkbox"
                          checked={reminderSettings.browser_notifications_enabled}
                          onChange={(e) => setReminderSettings({...reminderSettings, browser_notifications_enabled: e.target.checked})}
                        />
                        <span>Enable browser notifications</span>
                      </label>
                      {reminderSettings.browser_notifications_enabled && notificationPermission !== "granted" && (
                        <Button
                          data-testid="enable-notifications-btn"
                          size="sm"
                          onClick={requestNotificationPermission}
                          className="enable-notif-btn"
                        >
                          <Bell size={16} /> Enable Notifications
                        </Button>
                      )}
                      {notificationPermission === "granted" && (
                        <span className="permission-granted">✓ Notifications enabled</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="settings-section">
                    <h3 className="settings-heading">Email Reminders</h3>
                    <div className="settings-item">
                      <label className="switch-label">
                        <input
                          type="checkbox"
                          checked={reminderSettings.email_enabled}
                          onChange={(e) => setReminderSettings({...reminderSettings, email_enabled: e.target.checked})}
                        />
                        <span>Enable email reminders</span>
                      </label>
                    </div>
                    {reminderSettings.email_enabled && (
                      <div className="form-group">
                        <Label htmlFor="email_address">Email Address</Label>
                        <Input
                          id="email_address"
                          data-testid="email-address-input"
                          type="email"
                          value={reminderSettings.email_address}
                          onChange={(e) => setReminderSettings({...reminderSettings, email_address: e.target.value})}
                          placeholder="your@email.com"
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="settings-section">
                    <h3 className="settings-heading">Reminder Timing</h3>
                    <p className="settings-description">Send reminders when vouchers expire in:</p>
                    <div className="reminder-days-grid">
                      {[7, 5, 3, 2, 1].map(day => (
                        <label key={day} className="day-checkbox">
                          <input
                            type="checkbox"
                            checked={reminderSettings.reminder_days.includes(day)}
                            onChange={() => toggleReminderDay(day)}
                          />
                          <span>{day} day{day > 1 ? 's' : ''}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  <Button
                    data-testid="save-settings-btn"
                    onClick={handleSaveReminderSettings}
                    className="submit-btn"
                  >
                    Save Settings
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button 
              data-testid="check-in-btn"
              size="lg" 
              variant="outline" 
              className="check-in-btn"
              onClick={handleCheckIn}
              disabled={isCheckingIn}
            >
              <MapPin size={20} /> {isCheckingIn ? "Searching..." : "Find Available Vouchers"}
            </Button>
          </div>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-container">
          <Card className="stat-card">
            <CardContent>
              <div className="stat-icon total">
                <Ticket size={24} />
              </div>
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total Vouchers</div>
            </CardContent>
          </Card>
          
          <Card className="stat-card">
            <CardContent>
              <div className="stat-icon active">
                <TrendingUp size={24} />
              </div>
              <div className="stat-value">{stats.active}</div>
              <div className="stat-label">Active</div>
            </CardContent>
          </Card>
          
          <Card className="stat-card">
            <CardContent>
              <div className="stat-icon expiring">
                <Bell size={24} />
              </div>
              <div className="stat-value">{stats.expiring_soon}</div>
              <div className="stat-label">Expiring Soon</div>
            </CardContent>
          </Card>
          
          <Card className="stat-card">
            <CardContent>
              <div className="stat-icon expired">
                <Calendar size={24} />
              </div>
              <div className="stat-value">{stats.expired}</div>
              <div className="stat-label">Expired</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="main-content">
        <Tabs defaultValue="all" className="voucher-tabs">
          <TabsList className="tabs-list">
            <TabsTrigger data-testid="all-vouchers-tab" value="all">All Vouchers</TabsTrigger>
            <TabsTrigger data-testid="expiring-tab" value="expiring">
              Expiring Soon {expiringVouchers.length > 0 && `(${expiringVouchers.length})`}
            </TabsTrigger>
            {nearbyVouchers.length > 0 && (
              <TabsTrigger data-testid="nearby-tab" value="nearby">
                Nearby ({nearbyVouchers.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="all" className="tab-content">
            <div className="search-bar">
              <Search className="search-icon" size={20} />
              <Input
                data-testid="search-input"
                type="text"
                placeholder="Search by brand, code, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            
            <div className="vouchers-grid">
              {filteredVouchers.length === 0 ? (
                <div className="empty-state">
                  <Ticket size={64} className="empty-icon" />
                  <h3>No vouchers found</h3>
                  <p>Start adding vouchers to build your collection</p>
                </div>
              ) : (
                filteredVouchers.map((voucher) => (
                  <Card key={voucher.id} className={`voucher-card ${isExpired(voucher.expiry_date) ? 'expired' : ''}`} data-testid="voucher-card">
                    <CardHeader>
                      <div className="voucher-header">
                        <div className="brand-info">
                          <CardTitle className="brand-name">{voucher.brand_name}</CardTitle>
                          {voucher.category && (
                            <Badge variant="outline" className="category-badge">
                              <Tag size={12} /> {voucher.category}
                            </Badge>
                          )}
                        </div>
                        <Button
                          data-testid="delete-voucher-btn"
                          size="icon"
                          variant="ghost"
                          className="delete-btn"
                          onClick={() => handleDeleteVoucher(voucher.id)}
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="discount-amount">{voucher.discount_amount}</div>
                      <div className="voucher-code">
                        <code>{voucher.voucher_code}</code>
                      </div>
                      
                      {voucher.description && (
                        <p className="voucher-description">{voucher.description}</p>
                      )}
                      
                      <div className="voucher-details">
                        <div className="detail-item">
                          <Calendar size={16} />
                          <span>Expires: {new Date(voucher.expiry_date).toLocaleDateString()}</span>
                        </div>
                        
                        {!isExpired(voucher.expiry_date) && (
                          <div className={`expiry-warning ${getDaysUntilExpiry(voucher.expiry_date) <= 7 ? 'urgent' : ''}`}>
                            {getDaysUntilExpiry(voucher.expiry_date)} days left
                          </div>
                        )}
                        
                        {isExpired(voucher.expiry_date) && (
                          <div className="expired-badge">Expired</div>
                        )}
                        
                        <div className="detail-item">
                          {voucher.redemption_type === 'online' && <Globe size={16} />}
                          {voucher.redemption_type === 'offline' && <Store size={16} />}
                          {voucher.redemption_type === 'both' && <Globe size={16} />}
                          <span>
                            {voucher.redemption_type === 'online' && 'Online Only'}
                            {voucher.redemption_type === 'offline' && 'In-Store Only'}
                            {voucher.redemption_type === 'both' && 'Online & In-Store'}
                          </span>
                        </div>
                        
                        <div className="detail-item">
                          <MapPin size={16} />
                          <span>
                            {voucher.store_type === 'international' && 'Available Internationally'}
                            {voucher.store_type === 'regional' && `${voucher.region || 'Regional'}`}
                            {voucher.store_type === 'specific' && (voucher.store_location || 'Specific Store')}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="expiring" className="tab-content">
            <div className="alert-banner">
              <Bell size={20} />
              <span>These vouchers will expire within the next 7 days</span>
            </div>
            
            <div className="vouchers-grid">
              {expiringVouchers.length === 0 ? (
                <div className="empty-state">
                  <Bell size={64} className="empty-icon" />
                  <h3>No expiring vouchers</h3>
                  <p>All your vouchers are safe for now!</p>
                </div>
              ) : (
                expiringVouchers.map((voucher) => (
                  <Card key={voucher.id} className="voucher-card expiring" data-testid="expiring-voucher-card">
                    <CardHeader>
                      <div className="voucher-header">
                        <div className="brand-info">
                          <CardTitle className="brand-name">{voucher.brand_name}</CardTitle>
                          {voucher.category && (
                            <Badge variant="outline" className="category-badge">
                              <Tag size={12} /> {voucher.category}
                            </Badge>
                          )}
                        </div>
                        <Button
                          data-testid="delete-expiring-voucher-btn"
                          size="icon"
                          variant="ghost"
                          className="delete-btn"
                          onClick={() => handleDeleteVoucher(voucher.id)}
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="discount-amount">{voucher.discount_amount}</div>
                      <div className="voucher-code">
                        <code>{voucher.voucher_code}</code>
                      </div>
                      
                      {voucher.description && (
                        <p className="voucher-description">{voucher.description}</p>
                      )}
                      
                      <div className="voucher-details">
                        <div className="detail-item">
                          <Calendar size={16} />
                          <span>Expires: {new Date(voucher.expiry_date).toLocaleDateString()}</span>
                        </div>
                        
                        <div className="expiry-warning urgent">
                          {getDaysUntilExpiry(voucher.expiry_date)} days left
                        </div>
                        
                        <div className="detail-item">
                          {voucher.redemption_type === 'online' && <Globe size={16} />}
                          {voucher.redemption_type === 'offline' && <Store size={16} />}
                          {voucher.redemption_type === 'both' && <Globe size={16} />}
                          <span>
                            {voucher.redemption_type === 'online' && 'Online Only'}
                            {voucher.redemption_type === 'offline' && 'In-Store Only'}
                            {voucher.redemption_type === 'both' && 'Online & In-Store'}
                          </span>
                        </div>
                        
                        <div className="detail-item">
                          <MapPin size={16} />
                          <span>
                            {voucher.store_type === 'international' && 'Available Internationally'}
                            {voucher.store_type === 'regional' && `${voucher.region || 'Regional'}`}
                            {voucher.store_type === 'specific' && (voucher.store_location || 'Specific Store')}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {nearbyVouchers.length > 0 && (
            <TabsContent value="nearby" className="tab-content">
              <div className="alert-banner success">
                <MapPin size={20} />
                <span>Found {nearbyVouchers.length} voucher(s) near your location</span>
              </div>
              
              <div className="vouchers-grid">
                {nearbyVouchers.map((voucher) => (
                  <Card key={voucher.id} className="voucher-card nearby" data-testid="nearby-voucher-card">
                    <CardHeader>
                      <div className="voucher-header">
                        <div className="brand-info">
                          <CardTitle className="brand-name">{voucher.brand_name}</CardTitle>
                          {voucher.category && (
                            <Badge variant="outline" className="category-badge">
                              <Tag size={12} /> {voucher.category}
                            </Badge>
                          )}
                          {voucher.distance && (
                            <Badge className="distance-badge">
                              {voucher.distance} km away
                            </Badge>
                          )}
                        </div>
                        <Button
                          data-testid="delete-nearby-voucher-btn"
                          size="icon"
                          variant="ghost"
                          className="delete-btn"
                          onClick={() => handleDeleteVoucher(voucher.id)}
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="discount-amount">{voucher.discount_amount}</div>
                      <div className="voucher-code">
                        <code>{voucher.voucher_code}</code>
                      </div>
                      
                      {voucher.description && (
                        <p className="voucher-description">{voucher.description}</p>
                      )}
                      
                      <div className="voucher-details">
                        <div className="detail-item">
                          <Calendar size={16} />
                          <span>Expires: {new Date(voucher.expiry_date).toLocaleDateString()}</span>
                        </div>
                        
                        {!isExpired(voucher.expiry_date) && getDaysUntilExpiry(voucher.expiry_date) <= 7 && (
                          <div className="expiry-warning urgent">
                            {getDaysUntilExpiry(voucher.expiry_date)} days left
                          </div>
                        )}
                        
                        <div className="detail-item">
                          {voucher.redemption_type === 'online' && <Globe size={16} />}
                          {voucher.redemption_type === 'offline' && <Store size={16} />}
                          {voucher.redemption_type === 'both' && <Globe size={16} />}
                          <span>
                            {voucher.redemption_type === 'online' && 'Online Only'}
                            {voucher.redemption_type === 'offline' && 'In-Store Only'}
                            {voucher.redemption_type === 'both' && 'Online & In-Store'}
                          </span>
                        </div>
                        
                        <div className="detail-item">
                          <MapPin size={16} />
                          <span>
                            {voucher.store_type === 'international' && 'Available Internationally'}
                            {voucher.store_type === 'regional' && `${voucher.region || 'Regional'}`}
                            {voucher.store_type === 'specific' && (voucher.store_location || 'Specific Store')}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

export default App;