import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Shield, 
  TrendingUp, 
  LogOut, 
  Settings, 
  Plus, 
  Trash2, 
  Clock, 
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  Zap,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { Toaster, toast } from "sonner";
import axios from "axios";
import { supabase } from "./lib/supabase";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Token {
  id: string;
  token: string;
  expiry_date: string;
  is_active: boolean;
  role: "user" | "admin";
  label?: string;
  created_at: string;
}

interface Signal {
  type: "BUY" | "SELL" | "CALL" | "PUT";
  entry: string | number;
  tp?: string;
  sl?: string;
  duration?: string;
  confidence: "High" | "Medium" | "Low";
  confirmationZone?: string;
  recommendations?: string[];
  timestamp: string;
  pair: string;
}

// --- Components ---

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "outline" | "danger" }>(
  ({ className, variant = "primary", ...props }, ref) => {
    const variants = {
      primary: "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/20",
      secondary: "bg-slate-800 hover:bg-slate-700 text-slate-200",
      outline: "border border-indigo-500/30 bg-transparent hover:bg-indigo-500/10 text-indigo-400",
      danger: "bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20",
    };
    return (
      <button
        ref={ref}
        className={cn(
          "px-4 py-3 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

const Card = ({ children, className, ...props }: { children: React.ReactNode; className?: string; [key: string]: any }) => (
  <div className={cn("bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6", className)} {...props}>
    {children}
  </div>
);

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn(
      "w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600",
      className
    )}
    {...props}
  />
);

const Select = ({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (val: string) => void }) => (
  <div className="space-y-2">
    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
      >
        <option value="">Choose {label.toLowerCase()}...</option>
        {options.map((opt) => (
          <option key={opt} value={opt.toLowerCase()}>{opt}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
    </div>
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold">{title}</h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
              <XCircle className="w-6 h-6 text-slate-500" />
            </button>
          </div>
          {children}
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

// --- Main App ---

export default function App() {
  const [token, setToken] = useState<string>(localStorage.getItem("md_token") || "");
  const [user, setUser] = useState<Token | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<"dashboard" | "admin">("dashboard");
  const [isExpiredModalOpen, setIsExpiredModalOpen] = useState(false);
  const [restrictions, setRestrictions] = useState<Record<string, number>>({});
  const [showRestrictionModal, setShowRestrictionModal] = useState(false);
  const [restrictionRemaining, setRestrictionRemaining] = useState("");

  const [sessionId] = useState(() => {
    let id = localStorage.getItem("md_session_id");
    if (!id) {
      id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem("md_session_id", id);
    }
    return id;
  });

  // Dashboard State
  const [broker, setBroker] = useState("");
  const [pair, setPair] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [availablePairs, setAvailablePairs] = useState<string[]>([]);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [countdown, setCountdown] = useState<string>("");

  useEffect(() => {
    const savedToken = localStorage.getItem("md_token");
    if (savedToken) {
      setToken(savedToken);
      handleLogin(savedToken);
    }
  }, []);

  useEffect(() => {
    if (user && isAuth) {
      const timer = setInterval(() => {
        setCountdown(getRemainingTime(user.expiry_date));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [user, isAuth]);

  useEffect(() => {
    if (broker) {
      fetchPairs();
      setPair("");
      setTimeframe("");
    }
  }, [broker]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (restrictions[pair]) {
        const diff = restrictions[pair] - Date.now();
        if (diff > 0) {
          const seconds = Math.floor((diff / 1000) % 60);
          const minutes = Math.floor((diff / 1000 / 60) % 60);
          setRestrictionRemaining(`${minutes}:${seconds.toString().padStart(2, "0")}`);
        } else {
          setRestrictionRemaining("");
          const newRestrictions = { ...restrictions };
          delete newRestrictions[pair];
          setRestrictions(newRestrictions);
        }
      } else {
        setRestrictionRemaining("");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [restrictions, pair]);

  const fetchPairs = async () => {
    try {
      let endpoint = "";
      if (broker === "binance") endpoint = "/api/market/binance-pairs";
      else if (broker === "forex") endpoint = "/api/market/forex-pairs";
      else if (broker === "quotex") endpoint = "/api/market/quotex-pairs";

      if (endpoint) {
        const response = await axios.get(endpoint);
        setAvailablePairs(response.data);
      }
    } catch (err) {
      toast.error("Failed to fetch market pairs");
    }
  };

  // Admin State
  const [allTokens, setAllTokens] = useState<Token[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<Token | null>(null);
  const [newTokenForm, setNewTokenForm] = useState({ label: "", days: "30" });
  const [editTokenForm, setEditTokenForm] = useState({ label: "", days_remaining: "30", is_active: true });

  const handleLogin = async (tokenToUse: string) => {
    if (!tokenToUse) return;
    setIsLoading(true);
    console.log("Attempting login with token:", tokenToUse.substring(0, 5) + "...");
    
    try {
      // 1. Try the API first (Full-stack mode)
      const response = await axios.post("/api/auth/validate-token", { 
        token: tokenToUse,
        sessionId,
        location: Intl.DateTimeFormat().resolvedOptions().timeZone
      });

      console.log("Login response (API):", response.data);
      const { valid, role, token: tokenData } = response.data;

      if (valid) {
        setUser(tokenData);
        setIsAuth(true);
        setIsAdmin(role === "admin");
        localStorage.setItem("md_token", tokenToUse);
        toast.success("Access Granted!");
        return;
      }
    } catch (err: any) {
      console.warn("API Login failed, trying client-side fallback:", err.message);
      
      // If it's a specific error from the server (like expired or conflict), don't fallback
      if (err.response && err.response.status !== 404 && err.response.status !== 502) {
        const errorMsg = err.response?.data?.error || "Login failed. Please try again.";
        toast.error(errorMsg);
        if (err.response?.data?.code === "TOKEN_EXPIRED") setIsExpiredModalOpen(true);
        setIsLoading(false);
        return;
      }
    }

    // 2. Client-side Fallback (Static mode - e.g. Netlify)
    try {
      // Hardcoded Admin Token Fallback
      if (tokenToUse === "adminwaleed786") {
        const adminData: Token = { 
          id: "master-admin", 
          token: "adminwaleed786", 
          role: "admin", 
          is_active: true,
          label: "Master Admin",
          expiry_date: "2099-12-31",
          created_at: new Date().toISOString()
        };
        setUser(adminData);
        setIsAuth(true);
        setIsAdmin(true);
        localStorage.setItem("md_token", tokenToUse);
        toast.success("Access Granted (Master Admin)!");
        return;
      }

      if (!supabase) {
        toast.error("Database connection not configured. Please check your environment variables.");
        setIsLoading(false);
        return;
      }

      // Check admin tokens
      const { data: adminToken } = await supabase
        .from("admin_tokens")
        .select("*")
        .eq("token", tokenToUse)
        .maybeSingle();

      if (adminToken) {
        setUser(adminToken);
        setIsAuth(true);
        setIsAdmin(true);
        localStorage.setItem("md_token", tokenToUse);
        toast.success("Access Granted (Admin)!");
        return;
      }

      // Check user tokens
      const { data: userToken } = await supabase
        .from("users_tokens")
        .select("*")
        .eq("token", tokenToUse)
        .maybeSingle();

      if (!userToken) {
        toast.error("Invalid token. Please check your token and try again.");
        setIsLoading(false);
        return;
      }

      if (!userToken.is_active) {
        toast.error("Token is inactive");
        setIsLoading(false);
        return;
      }

      const now = new Date();
      const expiryDate = new Date(userToken.expiry_date);
      if (expiryDate < now) {
        setIsExpiredModalOpen(true);
        setIsLoading(false);
        return;
      }

      setUser(userToken);
      setIsAuth(true);
      setIsAdmin(false);
      localStorage.setItem("md_token", tokenToUse);
      toast.success("Access Granted!");
    } catch (err: any) {
      console.error("Fallback Login error:", err);
      toast.error("Login failed. Please check your internet connection and database configuration.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post("/api/auth/logout", { token });
    } catch (err) {
      console.error("Logout error:", err);
    }
    localStorage.removeItem("md_token");
    setIsAuth(false);
    setIsAdmin(false);
    setUser(null);
    setToken("");
    toast.info("Logged out");
  };

  const generateSignal = async () => {
    if (!broker || !pair) {
      toast.error("Please select broker and pair");
      return;
    }
    if (broker === "quotex" && !timeframe) {
      toast.error("Please select timeframe for Quotex");
      return;
    }

    setIsGenerating(true);
    setSignal(null);
    try {
      // 1. Try API first
      const response = await axios.post("/api/signals/generate", { 
        broker, 
        pair, 
        timeframe,
        token 
      });
      const signalData = response.data;

      setSignal(signalData);
      toast.success("Signal Generated!");
    } catch (err: any) {
      console.warn("API Signal generation failed, trying client-side fallback:", err.message);
      
      // If it's a specific business logic error from the server, don't fallback
      if (err.response && err.response.status !== 404 && err.response.status !== 502) {
        const errorMsg = err.response?.data?.error || "Failed to generate signal";
        toast.error(errorMsg);
        
        if (err.response?.data?.remainingMs) {
          setRestrictions(prev => ({
            ...prev,
            [pair]: Date.now() + err.response.data.remainingMs
          }));
          setShowRestrictionModal(true);
        }
        
        if (err.response?.data?.activeSignal) {
          setSignal(err.response.data.activeSignal);
        }
        setIsGenerating(false);
        return;
      }

      // 2. Client-side Fallback (Mock Signal for static hosts)
      toast.info("Running in Static Mode (No Backend). Generating simulated signal.");
      
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const types: ("CALL" | "PUT" | "BUY" | "SELL")[] = broker === "quotex" ? ["CALL", "PUT"] : ["BUY", "SELL"];
      const type = types[Math.floor(Math.random() * types.length)];
      const entry = (Math.random() * 100 + 1).toFixed(5);
      
      const mockSignal: Signal = {
        type,
        entry,
        tp: (parseFloat(entry) + (type === "CALL" || type === "BUY" ? 0.001 : -0.001)).toFixed(5),
        sl: (parseFloat(entry) + (type === "CALL" || type === "BUY" ? -0.0005 : 0.0005)).toFixed(5),
        duration: broker === "quotex" ? timeframe : "1-5m",
        confidence: Math.random() > 0.5 ? "High" : "Medium",
        confirmationZone: "Strong Support/Resistance",
        recommendations: ["Wait for candle confirmation", "Check RSI for divergence"],
        timestamp: new Date().toISOString(),
        pair
      };

      setSignal(mockSignal);
      toast.success("Simulated Signal Generated!");
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchAllTokens = async () => {
    if (!supabase) {
      toast.error("Database connection not configured.");
      return;
    }
    try {
      const { data, error } = await supabase.from("users_tokens").select("*");
      if (error) throw error;
      setAllTokens(data);
    } catch (err) {
      toast.error("Failed to fetch tokens");
    }
  };

  const generateNewToken = async () => {
    if (!supabase) {
      toast.error("Database connection not configured.");
      return;
    }
    try {
      const token = newTokenForm.label.trim() || ("MW-" + Math.random().toString(36).substring(2, 10).toUpperCase());
      
      const expiryDate = new Date();
      const daysInt = parseInt(newTokenForm.days || "30");
      expiryDate.setDate(expiryDate.getDate() + (isNaN(daysInt) ? 30 : daysInt));

      // Check if token already exists
      const { data: existing } = await supabase
        .from("users_tokens")
        .select("token")
        .eq("token", token)
        .single();

      if (existing) {
        toast.error("This token/name already exists. Please use a different one.");
        return;
      }

      const { data, error } = await supabase
        .from("users_tokens")
        .insert([{ 
          token, 
          expiry_date: expiryDate.toISOString(), 
          is_active: true,
          label: newTokenForm.label.trim() || token
        }])
        .select();

      if (error) throw error;

      fetchAllTokens();
      setIsCreateModalOpen(false);
      setNewTokenForm({ label: "", days: "30" });
      
      const generatedToken = data[0].token;
      navigator.clipboard.writeText(generatedToken);
      toast.success(`Token Generated: ${generatedToken}`, {
        description: "Token has been copied to clipboard automatically.",
        duration: 10000,
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to generate token");
    }
  };

  const updateToken = async () => {
    if (!editingToken || !supabase) return;
    try {
      const updateData: any = {};
      if (editTokenForm.label !== undefined) updateData.label = editTokenForm.label;
      if (editTokenForm.is_active !== undefined) updateData.is_active = editTokenForm.is_active;
      
      if (editTokenForm.days_remaining !== undefined) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + parseInt(editTokenForm.days_remaining.toString()));
        updateData.expiry_date = expiryDate.toISOString();
      }

      const { error } = await supabase
        .from("users_tokens")
        .update(updateData)
        .eq("id", editingToken.id);

      if (error) throw error;

      fetchAllTokens();
      setIsEditModalOpen(false);
      toast.success("Token updated!");
    } catch (err) {
      toast.error("Failed to update token");
    }
  };

  const deleteToken = async (id: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from("users_tokens")
        .delete()
        .eq("id", id);

      if (error) throw error;

      fetchAllTokens();
      toast.success("Token deleted!");
    } catch (err) {
      toast.error("Failed to delete token");
    }
  };

  const renewToken = async (id: string) => {
    if (!supabase) return;
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);

      const { error } = await supabase
        .from("users_tokens")
        .update({ expiry_date: expiryDate.toISOString() })
        .eq("id", id);

      if (error) throw error;

      fetchAllTokens();
      toast.success("Token renewed for 30 days!");
    } catch (err) {
      toast.error("Failed to renew token");
    }
  };

  const getRemainingTime = (expiryDate: string) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diff = expiry.getTime() - now.getTime();
    
    if (diff <= 0) return "Expired";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
  };

  if (!isAuth) {
    return (
      <div className="min-h-screen bg-[#0f0a1f] text-slate-200 flex items-center justify-center p-4 font-sans">
        <Toaster position="top-center" richColors />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8"
        >
          {/* Disclaimer */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-center">
            <p className="text-amber-500 text-sm font-medium">
              I am not a financial advisor. Risk management is essential.
            </p>
          </div>

          {/* Logo */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.2)] border-4 border-slate-800">
              <div className="text-slate-900 text-center">
                <TrendingUp className="w-8 h-8 mx-auto" />
                <span className="font-black text-xl leading-none">MW</span>
                <div className="text-[10px] font-bold tracking-tighter uppercase">Trader</div>
              </div>
            </div>
          </div>

          <Card className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Enter Access Token:</label>
                <Input 
                  placeholder="e.g. mwtrader123" 
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                <p className="text-[10px] text-slate-500 italic px-1">
                  * Use your unique access token provided by admin
                </p>
              </div>

            <Button 
              className="w-full" 
              onClick={() => handleLogin(token)}
              disabled={isLoading}
            >
              {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : "Access Bot"}
            </Button>

            <div className="grid grid-cols-2 gap-4">
              <Button variant="outline" className="text-sm">Free Group</Button>
              <Button variant="outline" className="text-sm">Paid Token</Button>
            </div>
          </Card>

          <p className="text-center text-slate-500 text-xs">
            ⚡ Powered by MW TRADER Signal Engine
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0a1f] text-slate-200 font-sans pb-20">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <header className="p-4 flex items-center justify-between sticky top-0 bg-[#0f0a1f]/80 backdrop-blur-md z-50 border-b border-slate-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-slate-900" />
          </div>
          <span className="font-bold tracking-tight">MW TRADER</span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button 
              variant="secondary" 
              className="px-3 py-2 rounded-lg text-xs"
              onClick={() => {
                setView(view === "dashboard" ? "admin" : "dashboard");
                if (view === "dashboard") fetchAllTokens();
              }}
            >
              {view === "dashboard" ? <Settings className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              {view === "dashboard" ? "Admin" : "Dashboard"}
            </Button>
          )}
          <Button 
            variant="danger" 
            className="px-3 py-2 rounded-lg text-xs"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        <AnimatePresence mode="wait">
          {view === "dashboard" ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Token Info */}
              {user && (
                <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Token Expiry</div>
                        <div className="text-sm font-bold text-indigo-400 tabular-nums">
                          {countdown}
                        </div>
                      </div>
                    </div>
                    <div className="bg-emerald-500/20 px-3 py-1 rounded-full text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                      ACTIVE
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/50 text-[10px]">
                    <div className="text-slate-500">
                      <span className="opacity-60">Activated:</span> {new Date(user.created_at).toLocaleDateString()}
                    </div>
                    {user.label && (
                      <div className="text-indigo-400/60">
                        <span className="opacity-60">Label:</span> {user.label}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-center">
                <p className="text-amber-500 text-xs font-medium">
                  I am not a financial advisor. Risk management is essential.
                </p>
              </div>

              {/* Logo */}
              <div className="flex justify-center">
                <div className="w-32 h-32 rounded-full bg-white flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.1)] border-4 border-slate-800">
                  <div className="text-slate-900 text-center">
                    <TrendingUp className="w-10 h-10 mx-auto" />
                    <span className="font-black text-2xl leading-none">MW</span>
                    <div className="text-[12px] font-bold tracking-tighter uppercase">Trader</div>
                  </div>
                </div>
              </div>

              <Card className="space-y-6">
                <Select 
                  label="Select Broker" 
                  options={["Binance", "Forex", "Quotex"]} 
                  value={broker}
                  onChange={setBroker}
                />
                <Select 
                  label="Select Pair" 
                  options={availablePairs} 
                  value={pair}
                  onChange={setPair}
                />
                {broker === "quotex" && (
                  <Select 
                    label="Select Timeframe" 
                    options={["5s", "10s", "15s", "30s", "1m", "2m", "3m", "5m", "10m", "15m", "30m", "1h", "4h", "1d"]} 
                    value={timeframe}
                    onChange={setTimeframe}
                  />
                )}

                <Button 
                  className="w-full py-4 text-lg" 
                  onClick={generateSignal}
                  disabled={isGenerating}
                >
                  {isGenerating ? <RefreshCw className="w-6 h-6 animate-spin" /> : "Generate Signal"}
                </Button>
              </Card>

              {/* Signal Result */}
              <AnimatePresence>
                {signal && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                      "rounded-3xl p-6 border-2 shadow-2xl",
                      signal.type === "BUY" || signal.type === "CALL" 
                        ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                        : "bg-rose-500/10 border-rose-500/50 text-rose-400"
                    )}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5" />
                        <span className="font-bold text-xl">{signal.type} SIGNAL</span>
                      </div>
                      <div className="bg-slate-950/50 px-3 py-1 rounded-full text-xs font-bold border border-white/10">
                        {signal.confidence} Confidence
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-950/30 p-3 rounded-xl border border-white/5">
                        <div className="text-[10px] uppercase opacity-60 mb-1">Entry Price</div>
                        <div className="font-mono text-lg font-bold text-white">{signal.entry}</div>
                      </div>
                      <div className="bg-slate-950/30 p-3 rounded-xl border border-white/5">
                        <div className="text-[10px] uppercase opacity-60 mb-1">Pair</div>
                        <div className="font-mono text-lg font-bold text-white">{signal.pair.toUpperCase()}</div>
                      </div>
                      {signal.tp && (
                        <div className="bg-emerald-500/20 p-3 rounded-xl border border-emerald-500/20">
                          <div className="text-[10px] uppercase opacity-60 mb-1">Take Profit</div>
                          <div className="font-mono text-lg font-bold text-emerald-400">{signal.tp}</div>
                        </div>
                      )}
                      {signal.sl && (
                        <div className="bg-rose-500/20 p-3 rounded-xl border border-rose-500/20">
                          <div className="text-[10px] uppercase opacity-60 mb-1">Stop Loss</div>
                          <div className="font-mono text-lg font-bold text-rose-400">{signal.sl}</div>
                        </div>
                      )}
                      {signal.duration && (
                        <div className="bg-indigo-500/20 p-3 rounded-xl border border-indigo-500/20 col-span-2">
                          <div className="text-[10px] uppercase opacity-60 mb-1">Duration</div>
                          <div className="font-mono text-lg font-bold text-indigo-400">{signal.duration}</div>
                        </div>
                      )}
                    </div>

                    {signal.confirmationZone && (
                      <div className="mt-4 bg-slate-950/40 p-4 rounded-2xl border border-white/10">
                        <div className="flex items-center gap-2 mb-2">
                          <Shield className="w-4 h-4 text-indigo-400" />
                          <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Confirmation Zone</span>
                        </div>
                        <div className="text-sm font-mono text-white bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20 text-center font-bold">
                          {signal.confirmationZone}
                        </div>
                        <p className="mt-2 text-[10px] text-slate-500 text-center leading-tight">
                          💡 <span className="font-medium">How to use:</span> Wait for the market price to reach this specific zone before entering your trade. This confirms the trend and reduces risk.
                        </p>
                      </div>
                    )}

                    {signal.recommendations && signal.recommendations.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2 px-1">
                          <Zap className="w-4 h-4 text-amber-400" />
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Bonus Tips & Scenarios</span>
                        </div>
                        <div className="space-y-2">
                          {signal.recommendations.map((rec, i) => (
                            <div key={i} className="flex gap-3 p-3 bg-slate-950/30 rounded-xl border border-white/5 text-xs leading-relaxed">
                              <div className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-500 font-bold">
                                {i + 1}
                              </div>
                              <p className="text-slate-300">{rec}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-2 text-[10px] opacity-50 justify-center">
                      <Clock className="w-3 h-3" />
                      Generated at {new Date(signal.timestamp).toLocaleTimeString()}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!signal && !isGenerating && (
                <div className="text-center p-8 border-2 border-dashed border-slate-800 rounded-3xl">
                  <p className="text-slate-500 text-sm">
                    Select broker, pair, and timeframe to generate signals
                  </p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="admin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Token Management</h2>
                <Button onClick={() => setIsCreateModalOpen(true)} className="px-3 py-2 rounded-lg text-xs">
                  <Plus className="w-4 h-4" />
                  New Token
                </Button>
              </div>

              <div className="space-y-4">
                {allTokens.map((t) => (
                  <Card key={t.id} className="p-4 flex items-center justify-between bg-slate-900/80">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-400">{t.token}</span>
                        {t.is_active ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-500" />
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getRemainingTime(t.expiry_date)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="secondary" 
                        className="p-2 rounded-lg"
                        onClick={() => {
                          navigator.clipboard.writeText(t.token);
                          toast.success("Token copied!");
                        }}
                        title="Copy Token"
                      >
                        <Plus className="w-4 h-4 rotate-45" />
                      </Button>
                      <Button 
                        variant="secondary" 
                        className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/20"
                        onClick={() => renewToken(t.id)}
                        title="Renew 30 Days"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="secondary" 
                        className="p-2 rounded-lg"
                        onClick={() => {
                          setEditingToken(t);
                          setEditTokenForm({ 
                            label: t.label || "", 
                            days_remaining: "30", 
                            is_active: t.is_active 
                          });
                          setIsEditModalOpen(true);
                        }}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="danger" 
                        className="p-2 rounded-lg"
                        onClick={() => deleteToken(t.id)}
                        title="Delete Token"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <Modal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        title="Generate New Token"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400">Enter Token Name:</label>
            <Input 
              placeholder="e.g. mwtrader123" 
              value={newTokenForm.label}
              onChange={(e) => setNewTokenForm({ ...newTokenForm, label: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400">Validity (Days):</label>
            <Input 
              type="number"
              value={newTokenForm.days}
              onChange={(e) => setNewTokenForm({ ...newTokenForm, days: e.target.value })}
            />
          </div>
          <Button className="w-full mt-4" onClick={generateNewToken}>
            Generate Token
          </Button>
        </div>
      </Modal>

      <Modal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        title="Edit Token"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400">Token Name:</label>
            <Input 
              placeholder="e.g. mwtrader123" 
              value={editTokenForm.label}
              onChange={(e) => setEditTokenForm({ ...editTokenForm, label: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400">Reset Validity (Days from now):</label>
            <Input 
              type="number"
              value={editTokenForm.days_remaining}
              onChange={(e) => setEditTokenForm({ ...editTokenForm, days_remaining: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-950/50 rounded-xl border border-slate-800">
            <input 
              type="checkbox" 
              id="is_active"
              checked={editTokenForm.is_active}
              onChange={(e) => setEditTokenForm({ ...editTokenForm, is_active: e.target.checked })}
              className="w-5 h-5 rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-slate-300">Token is Active</label>
          </div>
          <Button className="w-full mt-4" onClick={updateToken}>
            Save Changes
          </Button>
        </div>
      </Modal>

      {/* Expiry Modal */}
      <Modal 
        isOpen={isExpiredModalOpen} 
        onClose={() => setIsExpiredModalOpen(false)} 
        title="Token Expired"
      >
        <div className="text-center space-y-6 py-4">
          <div className="w-20 h-20 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto border-2 border-rose-500/20">
            <AlertTriangle className="w-10 h-10 text-rose-500" />
          </div>
          
          <div className="space-y-2">
            <h4 className="text-lg font-bold text-white">Subscription Ended</h4>
            <p className="text-sm text-slate-400 leading-relaxed">
              Your access token has officially expired. To continue receiving high-accuracy signals and market analysis, please renew your subscription.
            </p>
          </div>

          <div className="pt-4 space-y-3">
            <Button 
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              onClick={() => window.open("https://t.me/your_admin_link", "_blank")}
            >
              Contact Admin to Renew
            </Button>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setIsExpiredModalOpen(false)}
            >
              Close
            </Button>
          </div>

          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            MW TRADER • Signal Engine
          </p>
        </div>
      </Modal>

      {/* Restriction Modal */}
      <Modal 
        isOpen={showRestrictionModal} 
        onClose={() => setShowRestrictionModal(false)} 
        title="Signal Restricted"
      >
        <div className="text-center space-y-6 py-4">
          <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto border-2 border-amber-500/20">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>
          
          <div className="space-y-2">
            <h4 className="text-lg font-bold text-white">Wait for Duration</h4>
            <p className="text-sm text-slate-400 leading-relaxed">
              You have already generated a signal for <span className="font-bold text-white">{pair.toUpperCase()}</span>. 
              Please wait for the previous trade duration to complete before generating a new one for this pair.
            </p>
          </div>

          <div className="bg-slate-950/50 p-6 rounded-3xl border border-slate-800 shadow-inner">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Remaining Time</div>
            <div className="text-4xl font-mono font-bold text-amber-500 tabular-nums">
              {restrictionRemaining || "0:00"}
            </div>
          </div>

          <div className="pt-4">
            <Button 
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => setShowRestrictionModal(false)}
            >
              Understood
            </Button>
          </div>

          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            MW TRADER • Security System
          </p>
        </div>
      </Modal>
    </div>
  );
}
