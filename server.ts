import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Binance API Setup
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_SECRET_KEY = process.env.BINANCE_SECRET_KEY;

// --- API Routes ---

// Fetch Binance Futures Pairs
app.get("/api/market/binance-pairs", async (req, res) => {
  try {
    const response = await axios.get("https://fapi.binance.com/fapi/v1/exchangeInfo");
    const symbols = response.data.symbols
      .filter((s: any) => s.status === "TRADING" && s.quoteAsset === "USDT")
      .map((s: any) => s.symbol);
    res.json(symbols);
  } catch (error) {
    console.error("Binance Pairs Error:", error);
    res.status(500).json({ error: "Failed to fetch Binance pairs" });
  }
});

// Fetch Forex Pairs (Comprehensive list)
app.get("/api/market/forex-pairs", async (req, res) => {
  const pairs = [
    "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD",
    "EUR/GBP", "EUR/JPY", "GBP/JPY", "EUR/AUD", "EUR/CAD", "AUD/JPY", "CAD/JPY",
    "AUD/NZD", "EUR/NZD", "GBP/AUD", "GBP/CAD", "GBP/CHF", "GBP/NZD", "NZD/JPY",
    "XAU/USD (Gold)", "XAG/USD (Silver)", "WTI/USD (Oil)", "BTC/USD", "ETH/USD", "LTC/USD", "XRP/USD"
  ];
  res.json(pairs);
});

// Fetch Quotex Pairs (Including all OTC)
app.get("/api/market/quotex-pairs", async (req, res) => {
  const pairs = [
    "EUR/USD (OTC)", "GBP/USD (OTC)", "USD/JPY (OTC)", "AUD/CAD (OTC)", "EUR/GBP (OTC)",
    "USD/CHF (OTC)", "NZD/USD (OTC)", "GBP/JPY (OTC)", "EUR/JPY (OTC)", "AUD/USD (OTC)",
    "USD/CAD (OTC)", "EUR/CHF (OTC)", "CAD/CHF (OTC)", "CHF/JPY (OTC)", "AUD/NZD (OTC)",
    "Bitcoin (OTC)", "Ethereum (OTC)", "Litecoin (OTC)", "Ripple (OTC)", "Gold (OTC)", "Silver (OTC)", "Boeing (OTC)",
    "Apple (OTC)", "Facebook (OTC)", "Google (OTC)", "Netflix (OTC)", "Tesla (OTC)"
  ];
  res.json(pairs);
});

// Token Validation
app.post("/api/auth/validate-token", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  try {
    // Hardcoded Admin Token Fallback
    if (token === "adminwaleed786") {
      return res.json({ valid: true, role: "admin", token: { id: "master-admin", token: "adminwaleed786", role: "admin", is_active: true } });
    }

    // Check if it's an admin token first
    const { data: adminToken, error: adminError } = await supabase
      .from("admin_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (adminToken) {
      return res.json({ valid: true, role: "admin", token: adminToken });
    }

    // Check if it's a user token
    const { data: userToken, error: userError } = await supabase
      .from("users_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (!userToken) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Check expiry
    const now = new Date();
    const expiryDate = new Date(userToken.expiry_date);

    if (expiryDate < now) {
      return res.status(401).json({ 
        error: "Your access token has expired. Please renew your subscription to continue using MW TRADER.", 
        code: "TOKEN_EXPIRED" 
      });
    }

    if (!userToken.is_active) {
      return res.status(401).json({ error: "Token is inactive" });
    }

    res.json({ 
      valid: true, 
      role: "user", 
      token: {
        ...userToken,
        expiry_date: userToken.expiry_date,
        label: userToken.label,
        created_at: userToken.created_at
      } 
    });
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Signal Generation Engine
const getYahooSymbol = (pair: string) => {
  const p = pair.toUpperCase();
  
  // Direct matches for common assets
  if (p.includes("GOLD") || p.includes("XAU")) return "GC=F";
  if (p.includes("SILVER") || p.includes("XAG")) return "SI=F";
  if (p.includes("OIL") || p.includes("WTI")) return "CL=F";
  if (p.includes("BITCOIN") || p.includes("BTC")) return "BTC-USD";
  if (p.includes("ETHEREUM") || p.includes("ETH")) return "ETH-USD";
  if (p.includes("LITECOIN") || p.includes("LTC")) return "LTC-USD";
  if (p.includes("RIPPLE") || p.includes("XRP")) return "XRP-USD";
  
  // Stocks
  if (p.includes("BOEING")) return "BA";
  if (p.includes("APPLE")) return "AAPL";
  if (p.includes("FACEBOOK") || p.includes("META")) return "META";
  if (p.includes("GOOGLE")) return "GOOGL";
  if (p.includes("NETFLIX")) return "NFLX";
  if (p.includes("TESLA")) return "TSLA";

  // Default Forex logic: EUR/USD -> EURUSD=X
  const clean = p.split(" ")[0].replace("/", "");
  return `${clean}=X`;
};

app.post("/api/signals/generate", async (req, res) => {
  const { broker, pair, timeframe } = req.body;

  if (!broker || !pair) {
    return res.status(400).json({ error: "Broker and Pair are required" });
  }

  console.log(`Generating signal for ${broker} - ${pair} (${timeframe})`);

  try {
    let signalData = null;

    if (broker === "binance") {
      // Fetch real-time data from Binance
      const symbol = pair.replace("/", "").toUpperCase();
      const response = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      const ticker = response.data;

      const priceChangePercent = parseFloat(ticker.priceChangePercent);
      const lastPrice = parseFloat(ticker.lastPrice);
      
      const type = priceChangePercent > 0 ? "BUY" : "SELL";
      const tp = type === "BUY" ? lastPrice * 1.015 : lastPrice * 0.985;
      const sl = type === "BUY" ? lastPrice * 0.99 : lastPrice * 1.01;

      const getDecimals = (price: number) => {
        if (price > 1000) return 2;
        if (price > 1) return 4;
        return 6;
      };
      const decimals = getDecimals(lastPrice);
      const zoneMin = type === "BUY" ? lastPrice * 0.998 : lastPrice;
      const zoneMax = type === "BUY" ? lastPrice : lastPrice * 1.002;

      signalData = {
        type,
        entry: lastPrice.toFixed(decimals),
        tp: tp.toFixed(decimals),
        sl: sl.toFixed(decimals),
        confidence: Math.abs(priceChangePercent) > 1.5 ? "High" : "Medium",
        confirmationZone: `Wait for price between ${zoneMin.toFixed(decimals)} and ${zoneMax.toFixed(decimals)}`,
        recommendations: [
          "Wait for a 5-minute candle close inside the zone for confirmation.",
          "Use 3-5x leverage for safe risk management.",
          "Scenario: If price breaks SL, wait for retest of the zone before re-entry."
        ],
        timestamp: new Date().toISOString(),
        pair
      };
    } else if (broker === "forex" || broker === "quotex") {
      // Real-time analysis using Yahoo Finance
      const symbol = getYahooSymbol(pair);
      console.log(`Mapping ${pair} to Yahoo Symbol: ${symbol}`);
      
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`);
      
      if (!response.data || !response.data.chart || !response.data.chart.result) {
        throw new Error(`No data returned from Yahoo Finance for ${symbol}`);
      }

      const result = response.data.chart.result[0];
      const lastPrice = result.meta.regularMarketPrice;
      const previousClose = result.meta.previousClose;
      const priceChangePercent = ((lastPrice - previousClose) / previousClose) * 100;
      
      const isJpy = pair.includes("JPY");
      const isGold = pair.includes("XAU") || pair.includes("Gold");
      const isCrypto = pair.includes("BTC") || pair.includes("ETH") || pair.includes("Bitcoin") || pair.includes("Ethereum");
      
      const decimals = isJpy ? 3 : (isGold ? 2 : (isCrypto ? 2 : 5));

      if (broker === "forex") {
        const type = priceChangePercent > 0 ? "BUY" : "SELL";
        
        // Calculate TP/SL based on volatility and pair type
        let tpDist = 0.0050;
        let slDist = 0.0030;
        
        if (isJpy) { tpDist = 0.50; slDist = 0.30; }
        if (isGold) { tpDist = 5.0; slDist = 3.0; }
        if (isCrypto) { tpDist = lastPrice * 0.02; slDist = lastPrice * 0.01; }

        const zoneMin = type === "BUY" ? lastPrice - (tpDist * 0.1) : lastPrice;
        const zoneMax = type === "BUY" ? lastPrice : lastPrice + (tpDist * 0.1);

        signalData = {
          type,
          entry: lastPrice.toFixed(decimals),
          tp: (type === "BUY" ? lastPrice + tpDist : lastPrice - tpDist).toFixed(decimals),
          sl: (type === "BUY" ? lastPrice - slDist : lastPrice + slDist).toFixed(decimals),
          confidence: Math.abs(priceChangePercent) > 0.5 ? "High" : "Medium",
          confirmationZone: `Entry Zone: ${zoneMin.toFixed(decimals)} - ${zoneMax.toFixed(decimals)}`,
          recommendations: [
            "Check USD News (CPI/FOMC) before entering.",
            "Recommended Risk: 1% per trade.",
            "Scenario: Strong rejection from this zone confirms the move."
          ],
          timestamp: new Date().toISOString(),
          pair
        };
      } else {
        // Quotex Logic
        const type = priceChangePercent > 0 ? "CALL" : "PUT";
        signalData = {
          type,
          entry: lastPrice.toFixed(decimals),
          duration: timeframe || "1m",
          confidence: "High",
          confirmationZone: "Wait for next candle opening",
          recommendations: [
            "Avoid trading during high volatility news.",
            "Use Martingale only up to Step 1 if needed.",
            "Scenario: Wait for the current candle to exhaust before entry."
          ],
          timestamp: new Date().toISOString(),
          pair
        };
      }
    }

    res.json(signalData);
  } catch (error: any) {
    console.error("Signal generation error:", error.message || error);
    res.status(500).json({ error: "Failed to generate signal. Market might be closed or symbol is invalid." });
  }
});

// Admin: Token Management
app.get("/api/admin/tokens", async (req, res) => {
  try {
    const { data: tokens, error } = await supabase.from("users_tokens").select("*");
    if (error) throw error;
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tokens" });
  }
});

app.post("/api/admin/generate-token", async (req, res) => {
  const { days = 30, label = "" } = req.body;
  
  // Use label as the token if provided, otherwise generate a random one
  const token = label.trim() || ("MW-" + Math.random().toString(36).substring(2, 10).toUpperCase());
  
  const expiryDate = new Date();
  const daysInt = parseInt(days?.toString() || "30");
  expiryDate.setDate(expiryDate.getDate() + (isNaN(daysInt) ? 30 : daysInt));

  try {
    // Check if token already exists to prevent unique constraint error
    const { data: existing } = await supabase
      .from("users_tokens")
      .select("token")
      .eq("token", token)
      .single();

    if (existing) {
      return res.status(400).json({ error: "This token/name already exists. Please use a different one." });
    }

    const { data, error } = await supabase
      .from("users_tokens")
      .insert([{ 
        token, 
        expiry_date: expiryDate.toISOString(), 
        is_active: true,
        label: label.trim() || token // Store label as well for reference
      }])
      .select();

    if (!error && data && data.length > 0) {
      return res.json({ ...data[0], message: "Token generated successfully! Copy the token below." });
    }

    console.warn("Primary token insert failed, attempting fallback:", error?.message);

    // Attempt 2: Minimal insert (no label) - in case the column doesn't exist
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("users_tokens")
      .insert([{ 
        token, 
        expiry_date: expiryDate.toISOString(), 
        is_active: true
      }])
      .select();
    
    if (!fallbackError && fallbackData && fallbackData.length > 0) {
      return res.json(fallbackData[0]);
    }

    console.error("All token insert attempts failed:", fallbackError);
    res.status(500).json({ 
      error: fallbackError?.message || "Database connection error. Please check your Supabase setup." 
    });
  } catch (error: any) {
    console.error("Token Generation Exception:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Admin: Update Token
app.put("/api/admin/tokens/:id", async (req, res) => {
  const { id } = req.params;
  const { label, days_remaining, is_active } = req.body;

  try {
    const updateData: any = {};
    if (label !== undefined) updateData.label = label;
    if (is_active !== undefined) updateData.is_active = is_active;
    
    if (days_remaining !== undefined) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + parseInt(days_remaining.toString()));
      updateData.expiry_date = expiryDate.toISOString();
    }

    const { data, error } = await supabase
      .from("users_tokens")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    console.error("Token Update Error:", error);
    res.status(500).json({ error: "Failed to update token" });
  }
});

// Admin: Delete Token
app.delete("/api/admin/tokens/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from("users_tokens")
      .delete()
      .eq("id", id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error("Token Deletion Error:", error);
    res.status(500).json({ error: "Failed to delete token" });
  }
});

// --- Vite Integration ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
