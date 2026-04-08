# WhatsApp AI Agent for PharmConnect Zim

> A practical guide to building an intelligent WhatsApp chatbot that connects patients to nearby pharmacy stock in Zimbabwe.

---

## How It Works

```
Patient sends WhatsApp message
        ↓
Twilio WhatsApp API receives it
        ↓
Webhook POST → Your Node.js Backend
        ↓
OpenAI GPT-4o parses intent
        ↓
Supabase RPC `find_nearby_pharmacies` queried
        ↓
Response formatted + sent back via Twilio
```

---

## Architecture

### Option A: Node.js + Twilio + OpenAI (Recommended)

**Stack:**
- **Twilio WhatsApp API** (Sandbox for testing — $0, Production ~$0.005/msg)
- **Node.js + Express** (backend webhook)
- **OpenAI GPT-4o** (intent parsing, ~$0.001 per query)
- **Supabase** (existing — already have pharmacy stock data)
- **Railway or Render** (free tier hosting)

**Estimated setup time:** 2–3 hours  
**Monthly cost (100 queries/day):** ~$3–8 USD

---

## Step-by-Step Setup

### 1. Set Up Twilio WhatsApp Sandbox

1. Sign up at [twilio.com](https://twilio.com)
2. Go to **Messaging > Try WhatsApp** — get the sandbox number
3. Test by sending "join [keyword]" from your phone to the sandbox number
4. Set webhook URL to your deployed backend: `https://your-app.railway.app/webhook/whatsapp`

### 2. Create the Node.js Backend

```bash
mkdir pharmconnect-whatsapp-bot
cd pharmconnect-whatsapp-bot
npm init -y
npm install express twilio openai @supabase/supabase-js dotenv
```

**`server.js`:**
```javascript
import express from 'express';
import { twiml } from 'twilio';
import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ── Symptom → intent mapping (fast pre-filter before AI) ─────────────────
const QUICK_SYMPTOMS = {
  'running stomach': ['ORS', 'Loperamide'],
  'diarrhoea': ['ORS', 'Loperamide'],
  'headache': ['Paracetamol', 'Ibuprofen'],
  'fever': ['Paracetamol', 'Coartem'],
  'malaria': ['Coartem', 'Artemether'],
  'cough': ['Amoxicillin', 'Bromhexine'],
};

// ── Main webhook handler ─────────────────────────────────────────────────
app.post('/webhook/whatsapp', async (req, res) => {
  const incomingMsg = req.body.Body?.trim() || '';
  const from = req.body.From; // e.g. "whatsapp:+263771234567"

  const MessagingResponse = twiml.MessagingResponse;
  const response = new MessagingResponse();
  const msg = response.message();

  try {
    // 1. Use GPT-4o to extract drug name, city, and intent
    const aiRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are PharmConnect Zim assistant. Extract from user message:
- drug_name: the drug or medication being searched (use generic name if possible)
- city: city in Zimbabwe (default: Harare)  
- intent: "find_drug" | "symptom_query" | "greeting" | "other"
- symptom_description: if symptom_query, describe the symptom

Return ONLY valid JSON like: {"drug_name":"paracetamol","city":"Harare","intent":"find_drug","symptom_description":null}`,
        },
        { role: 'user', content: incomingMsg },
      ],
      max_tokens: 150,
    });

    const parsed = JSON.parse(aiRes.choices[0].message.content || '{}');
    const { drug_name, city, intent, symptom_description } = parsed;

    if (intent === 'greeting') {
      msg.body(`👋 *Welcome to PharmConnect Zim!*\n\nI can help you find medications at pharmacies near you.\n\nTry:\n• "Where can I get paracetamol in Harare?"\n• "I have a running stomach"\n• "Find metformin near Bulawayo"`);
    } else if (intent === 'symptom_query' || symptom_description) {
      // Look up symptom → drugs mapping
      const sympLower = incomingMsg.toLowerCase();
      let suggestedDrugs = [];
      for (const [keyword, drugs] of Object.entries(QUICK_SYMPTOMS)) {
        if (sympLower.includes(keyword)) { suggestedDrugs = drugs; break; }
      }

      if (suggestedDrugs.length) {
        const drugList = suggestedDrugs.join(', ');
        msg.body(`🏥 Based on your symptoms, common medications include:\n*${drugList}*\n\nShall I find these at pharmacies near you in ${city}? Reply with the drug name.`);
      } else {
        msg.body(`I detected a health concern. Please describe your symptom more specifically, or ask me to find a specific drug by name.\n\nExample: "find paracetamol in Harare"`);
      }
    } else if (intent === 'find_drug' && drug_name) {
      // Query Supabase RPC
      const { data, error } = await supabase.rpc('find_nearby_pharmacies', {
        p_query: drug_name,
        p_lat: null,
        p_lng: null,
        p_radius_km: 50,
        p_city: city || 'Harare',
      });

      if (error || !data?.length) {
        msg.body(`❌ Sorry, I couldn't find *${drug_name}* at pharmacies in ${city} right now.\n\nTry:\n• A different spelling\n• A nearby city\n• Visit pharmconnect.co.zw for more options`);
      } else {
        // Top 3 results
        const results = data.slice(0, 3);
        let reply = `✅ *${drug_name}* found at ${results.length} pharmacy${results.length > 1 ? 'ies' : ''} in ${city}:\n\n`;
        results.forEach((r, i) => {
          reply += `*${i + 1}. ${r.pharmacy_name}*\n`;
          reply += `📍 ${r.suburb}\n`;
          if (r.unit_price) reply += `💵 $${parseFloat(r.unit_price).toFixed(2)}\n`;
          reply += `📦 ${r.stock_status === 'IN_STOCK' ? '✅ In Stock' : '⚠️ Low Stock'}\n`;
          if (r.phone) reply += `📞 ${r.phone}\n`;
          reply += '\n';
        });
        reply += `🔗 More results: pharmconnect.co.zw/search?drug=${encodeURIComponent(drug_name)}&city=${city}`;
        msg.body(reply);
      }
    } else {
      msg.body(`I'm not sure I understood that. Try:\n• "Find paracetamol in Harare"\n• "I have a headache"\n• "Where can I buy metformin?"`);
    }
  } catch (err) {
    console.error('Bot error:', err);
    msg.body('Sorry, I\'m having trouble right now. Please try again in a moment or visit pharmconnect.co.zw');
  }

  res.type('text/xml').send(response.toString());
});

app.listen(process.env.PORT || 3000, () => {
  console.log('WhatsApp bot running...');
});
```

### 3. Environment Variables (`.env`)

```env
OPENAI_API_KEY=sk-...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
PORT=3000
```

### 4. Deploy to Railway (Free Tier)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

Railway will give you a URL like `https://pharmconnect-bot-production.up.railway.app`.  
Set this as your Twilio webhook URL.

---

## Option B: n8n (No-Code Alternative)

If you prefer a no-code approach, use [n8n](https://n8n.io):

1. **Webhook node** → receives WhatsApp message from Twilio
2. **OpenAI node** → extract drug name from message
3. **HTTP Request node** → call Supabase `find_nearby_pharmacies` RPC
4. **Function node** → format the response
5. **HTTP Request node** → reply via Twilio REST API

n8n has a free self-hosted option or $20/month cloud.

---

## Sample Conversation Flows

### Scenario 1: Drug Search
```
Patient: "I need paracetamol 500mg in Harare"
Bot:     "✅ Paracetamol found at 3 pharmacies in Harare:
          1. MedSave Pharmacy
             📍 Borrowdale
             💵 $0.50
             ✅ In Stock
             📞 0771234567
          ..."
```

### Scenario 2: Symptom Query
```
Patient: "I have a running stomach, what can I take?"
Bot:     "🏥 Based on your symptoms, common medications include:
          ORS, Loperamide
          
          Shall I find these at pharmacies near you in Harare?
          Reply with the drug name."
          
Patient: "ORS"
Bot:     "✅ ORS found at 5 pharmacies in Harare:..."
```

### Scenario 3: Greeting
```
Patient: "Hi"
Bot:     "👋 Welcome to PharmConnect Zim!
          
          I can help you find medications at pharmacies near you.
          Try: 'Where can I get paracetamol in Harare?'"
```

---

## Production Checklist

- [ ] Move from Twilio Sandbox to production WhatsApp Business number
- [ ] Register with Meta Business for WhatsApp Business API
- [ ] Add rate limiting (e.g. 5 messages/minute per number)
- [ ] Add conversation history (store in Supabase `whatsapp_sessions` table)
- [ ] Add user location via WhatsApp location sharing → pass to RPC
- [ ] Add reservation creation via chat ("Reserve this drug")
- [ ] Set up monitoring with Sentry or similar

---

## Cost Estimate (Production)

| Service            | Cost                    |
|--------------------|------------------------|
| Twilio WhatsApp    | ~$0.005 per message    |
| OpenAI GPT-4o-mini | ~$0.001 per query       |
| Railway hosting    | Free tier / $5/month   |
| **100 queries/day**| ~$18/month total        |

---

## Notes

- The bot doesn't need a patient account — it's 100% anonymous
- The Supabase RPC `find_nearby_pharmacies` already handles symptom → drug mapping at the DB level, so GPT calls can be minimised
- WhatsApp number lookup can be used to personalise repeat users (optional)
- Future: Add **drug reservation via chat** by calling the `drug_reservations` table directly from the bot
