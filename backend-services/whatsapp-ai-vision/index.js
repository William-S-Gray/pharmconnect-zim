import express from 'express';
import { twiml } from 'twilio';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
// In reality we would fetch the image URL with Twilio auth

dotenv.config();

/**
 * WhatsApp AI Vision + Prescription Reader
 * 
 * Expands on the basic WhatsApp bot.
 * Patients can snap a photo of a doctor's handwritten prescription.
 * ChatGPT-4o-Vision reads it -> extracts the drug name -> queries Supabase -> replies with local pharmacies.
 */

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-mock' });
/**
 * Drug availability search via the PharmConnect API.
 *
 * Replaces a direct `find_nearby_pharmacies` RPC call made with a Supabase
 * key held by this service. The search endpoint is public, so this needs no
 * credentials at all — which is the right amount for a service that only
 * ever reads public availability.
 */
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function searchDrugs(query, { city = null, limit = 3 } = {}) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (city) params.set('city', city);

  const response = await fetch(`${API_URL}/api/search?${params}`);
  if (!response.ok) throw new Error(`Search failed: HTTP ${response.status}`);

  const { results } = await response.json();
  return results;
}

app.post('/webhook/whatsapp', async (req, res) => {
  const incomingMsg = req.body.Body?.trim() || '';
  const numMedia = parseInt(req.body.NumMedia || '0');
  
  const MessagingResponse = twiml.MessagingResponse;
  const response = new MessagingResponse();
  const msg = response.message();

  try {
    let drugName = '';

    if (numMedia > 0) {
      // 1. User uploaded an image of a prescription
      const mediaUrl = req.body.MediaUrl0;
      
      console.log(`[AI VISION] Received image prescription: ${mediaUrl}`);
      msg.body("📸 Scanning your doctor's prescription... Please wait.");
      
      // In production, Twilio Media URLs require authentication to download.
      // We pass the URL directly to GPT-4o Vision if it's publicly accessible, or download and encode it as base64.
      
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "You are a specialized medical assistant in Zimbabwe. Read this doctor's handwritten prescription. Extract only the generic drug name. Output JSON format e.g. {\"drug_name\": \"amoxicillin\"}" },
              { type: "image_url", image_url: { url: mediaUrl } }
            ],
          },
        ],
        max_tokens: 150,
      });

      const parsed = JSON.parse(aiRes.choices[0].message.content || '{}');
      drugName = parsed.drug_name;

      if (!drugName) {
        msg.body("⚠️ Sorry, I couldn't clearly read the handwriting. Please type out the name of the medicine instead.");
        return res.type('text/xml').send(response.toString());
      }

      msg.body(`✅ Prescription read successfully: *${drugName}*.\nSearching nearby pharmacies...`);

    } else {
      // 2. Standard Text-based NLP Extraction (from WHATSAPP_AI_AGENT.md)
      drugName = incomingMsg; // Skipping the text-parsing for brevity in this PoC
    }

    // 3. Query the API
    if (drugName) {
      let results = [];
      try {
        results = await searchDrugs(drugName, { city: 'Harare', limit: 3 });
      } catch (err) {
        console.error('[whatsapp] search failed:', err.message);
      }

      if (results.length === 0) {
        msg.body(`❌ Sorry, I couldn't find *${drugName}* locally right now.`);
      } else {
        let reply = `✅ *${drugName}* found at ${results.length} pharmacies:\n\n`;
        results.forEach((r, i) => {
          // unit_price arrives as a number; the parseFloat this replaced
          // silently produced NaN whenever the price was null.
          const price = r.unit_price == null ? 'price on request' : `$${r.unit_price.toFixed(2)}`;
          reply += `*${i + 1}. ${r.pharmacy_name}*\n📍 ${r.suburb}\n💵 ${price}\n📞 ${r.phone}\n\n`;
        });
        reply += `Reply "RESERVE 1" to reserve at ${results[0].pharmacy_name} instantly.`;
        msg.body(reply);
      }
    } else {
      msg.body("Please send a photo of your prescription or type the medicine name.");
    }

  } catch (err) {
    console.error('Vision Bot error:', err);
    msg.body("Sorry, I encountered an error scanning that prescription.");
  }

  res.type('text/xml').send(response.toString());
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`🤖 WhatsApp Vision Bot running on port ${PORT}`));
