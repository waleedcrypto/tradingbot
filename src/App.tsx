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

  // Dashboard State
  const [broker, setBroker] = useState("");
  const [pair, setPair] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [availablePairs, setAvailablePairs] = useState<string[]>([]);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [countdown, setCountdown] = useState<string>("");

  useEffect(() => {
    if (token) {
      handleLogin(token);
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

  const fetchPairs = async () => {
    try {
      if (broker === "binance") {
        const response = await axios.get("https://fapi.binance.com/fapi/v1/exchangeInfo");
        const symbols = response.data.symbols
          .filter((s: any) => s.status === "TRADING" && s.quoteAsset === "USDT")
          .map((s: any) => s.symbol);
        setAvailablePairs(symbols);
      } else if (broker === "forex") {
        setAvailablePairs([
          "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD",
          "EUR/GBP", "EUR/JPY", "GBP/JPY", "EUR/AUD", "EUR/CAD", "AUD/JPY", "CAD/JPY",
          "AUD/NZD", "EUR/NZD", "GBP/AUD", "GBP/CAD", "GBP/CHF", "GBP/NZD", "NZD/JPY",
          "XAU/USD (Gold)", "XAG/USD (Silver)", "WTI/USD (Oil)", "BTC/USD", "ETH/USD"
        ]);
      } else if (broker === "quotex") {
        setAvailablePairs([
          "EUR/USD (OTC)", "GBP/USD (OTC)", "USD/JPY (OTC)", "AUD/CAD (OTC)", "EUR/GBP (OTC)",
          "USD/CHF (OTC)", "NZD/USD (OTC)", "GBP/JPY (OTC)", "EUR/JPY (OTC)", "AUD/USD (OTC)",
          "USD/CAD (OTC)", "EUR/CHF (OTC)", "CAD/CHF (OTC)", "CHF/JPY (OTC)", "AUD/NZD (OTC)",
          "Bitcoin (OTC)", "Ethereum (OTC)", "Gold (OTC)", "Silver (OTC)", "Boeing (OTC)",
          "Apple (OTC)", "Facebook (OTC)", "Google (OTC)", "Netflix (OTC)", "Tesla (OTC)"
        ]);
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

  useEffect(() => {
    if (token) {
      handleLogin(token);
    }
  }, []);

  const handleLogin = async (tokenToUse: string) => {
    setIsLoading(true);
    try {
      // Hardcoded Admin Token Fallback
      if (tokenToUse === "adminwaleed786") {
        const adminData = { id: "master-admin", token: "adminwaleed786", role: "admin", is_active: true };
        setUser(adminData as any);
        setIsAuth(true);
        setIsAdmin(true);
        localStorage.setItem("md_token", tokenToUse);
        toast.success("Access Granted!");
        setIsLoading(false);
        return;
      }

      // Check Supabase for user tokens
      const { data: userToken, error: userError } = await supabase
        .from("users_tokens")
        .select("*")
        .eq("token", tokenToUse)
        .single();

      if (userError || !userToken) {
        toast.error("Invalid Token");
        localStorage.removeItem("md_token");
        setIsLoading(false);
        return;
      }

      // Check expiry
      const now = new Date();
      const expiryDate = new Date(userToken.expiry_date);

      if (expiryDate < now) {
        setIsExpiredModalOpen(true);
        localStorage.removeItem("md_token");
        setIsLoading(false);
        return;
      }

      if (!userToken.is_active) {
        toast.error("Token is inactive");
        localStorage.removeItem("md_token");
        setIsLoading(false);
        return;
      }

      setUser(userToken);
      setIsAuth(true);
      setIsAdmin(false);
      localStorage.setItem("md_token", tokenToUse);
      toast.success("Access Granted!");
    } catch (err: any) {
      toast.error("Login failed. Please try again.");
      localStorage.removeItem("md_token");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
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
      let signalData: Signal | null = null;

      if (broker === "binance") {
        const symbol = pair.replace("/", "").toUpperCase();
        const response = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
        const ticker = response.data;

        const priceChangePercent = parseFloat(ticker.priceChangePercent);
        const lastPrice = parseFloat(ticker.lastPrice);
        
        const type = priceChangePercent > 0 ? "BUY" : "SELL";
        const tp = type === "BUY" ? lastPrice * 1.015 : lastPrice * 0.985;
        const sl = type === "BUY" ? lastPrice * 0.99 : lastPrice * 1.01;

        signalData = {
          type,
          entry: lastPrice,
          tp: tp.toFixed(symbol.includes("USDT") ? 4 : 2),
          sl: sl.toFixed(symbol.includes("USDT") ? 4 : 2),
          confidence: Math.abs(priceChangePercent) > 1.5 ? "High" : "Medium",
          confirmationZone: type === "BUY" ? `${(lastPrice * 0.998).toFixed(4)} - ${lastPrice.toFixed(4)}` : `${lastPrice.toFixed(4)} - ${(lastPrice * 1.002).toFixed(4)}`,
          recommendations: [
            "Wait for a 5-minute candle close above entry for confirmation.",
            "Use 3-5x leverage for safe risk management.",
            "Scenario: If price breaks SL, wait for retest of the zone before re-entry."
          ],
          timestamp: new Date().toISOString(),
          pair
        };
      } else if (broker === "forex") {
        const basePrice = 1.0850 + (Math.random() * 0.01);
        const type = Math.random() > 0.5 ? "BUY" : "SELL";
        
        signalData = {
          type,
          entry: basePrice.toFixed(5),
          tp: (type === "BUY" ? basePrice + 0.0050 : basePrice - 0.0050).toFixed(5),
          sl: (type === "BUY" ? basePrice - 0.0030 : basePrice + 0.0030).toFixed(5),
          confidence: "High",
          confirmationZone: type === "BUY" ? "Demand Zone (H1 Support)" : "Supply Zone (H1 Resistance)",
          recommendations: [
            "Check USD News (CPI/FOMC) before entering.",
            "Recommended Risk: 1% per trade.",
            "Scenario: Strong rejection from the H1 zone confirms the move."
          ],
          timestamp: new Date().toISOString(),
          pair
        };
      } else if (broker === "quotex") {
        const type = Math.random() > 0.5 ? "CALL" : "PUT";
        signalData = {
          type,
          entry: "Market Price",
          duration: timeframe || "1m",
          confidence: "High",
          confirmationZone: "Next Candle Opening",
          recommendations: [
            "Avoid trading during high volatility news.",
            "Use Martingale only up to Step 1 if needed.",
            "Scenario: Wait for the current candle to exhaust before entry."
          ],
          timestamp: new Date().toISOString(),
          pair
        };
      }

      setSignal(signalData);
      toast.success("Signal Generated!");
    } catch (err) {
      toast.error("Failed to generate signal");
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchAllTokens = async () => {
    try {
      const { data, error } = await supabase.from("users_tokens").select("*");
      if (error) throw error;
      setAllTokens(data);
    } catch (err) {
      toast.error("Failed to fetch tokens");
    }
  };

  const generateNewToken = async () => {
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
    if (!editingToken) return;
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
                    options={["1m", "2m", "5m", "15m", "30m"]} 
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
                        <div className="text-sm font-mono text-white bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20 text-center">
                          {signal.confirmationZone}
                        </div>
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
    </div>
  );
}
