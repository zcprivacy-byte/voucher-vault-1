import { useState, useEffect } from "react";
import "@/App.css";
import axios from "axios";
import { Ticket, MapPin, Bell, Plus, Trash2, Search, TrendingUp, Calendar, Tag } from "lucide-react";
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

  const [newVoucher, setNewVoucher] = useState({
    brand_name: "",
    discount_amount: "",
    voucher_code: "",
    expiry_date: "",
    store_type: "international",
    store_location: "",
    region: "",
    category: "",
    description: ""
  });

  useEffect(() => {
    fetchVouchers();
    fetchExpiringVouchers();
    fetchStats();
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

  return (
    <div className="App">
      <Toaster position="top-center" richColors />
      
      <div className="hero-section">
        <div className="hero-content">
          <div className="hero-icon">
            <Ticket size={48} />
          </div>
          <h1 className="hero-title">VoucherVault</h1>
          <p className="hero-subtitle">Never miss a discount. Store, track, and redeem your vouchers effortlessly.</p>
          
          <div className="hero-actions">
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-voucher-btn" size="lg" className="add-voucher-btn">
                  <Plus size={20} /> Add Voucher
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
            
            <Button 
              data-testid="check-in-btn"
              size="lg" 
              variant="outline" 
              className="check-in-btn"
              onClick={handleCheckIn}
              disabled={isCheckingIn}
            >
              <MapPin size={20} /> {isCheckingIn ? "Checking..." : "Check-In at Store"}
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
                        
                        {voucher.store_location && (
                          <div className="detail-item">
                            <MapPin size={16} />
                            <span>{voucher.store_location}</span>
                          </div>
                        )}
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