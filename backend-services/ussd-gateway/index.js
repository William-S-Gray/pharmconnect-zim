import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

/**
 * PharmConnect USSD Gateway (Africa's Talking)
 * 
 * This service handles offline users dialing *144# in Zimbabwe.
 * It provides a menu-driven interface strictly over SMS GSM bounds (no internet needed).
 */

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

app.post('/ussd', async (req, res) => {
  // Read variables sent by Africa's Talking
  const { sessionId, serviceCode, phoneNumber, text } = req.body;

  // text is a string like "1*2*3" representing menu choices separated by *
  const inputs = text.split('*').filter(t => t.length > 0);
  const step = inputs.length;

  let response = '';

  try {
    if (step === 0) {
      // Main Menu
      response = `CON Welcome to PharmConnect Zim
1. Search specific Medicine
2. Symptom Checker
3. My Reservations
      `;
    } else if (step === 1 && inputs[0] === '1') {
      // Selected "Search Medicine"
      response = `CON Enter the medicine name:`;
    } else if (step === 2 && inputs[0] === '1') {
      // User entered a drug name, ask for location
      const query = inputs[1];
      response = `CON Enter your City or Suburb to find ${query}:`;
    } else if (step === 3 && inputs[0] === '1') {
      const drugQuery = inputs[1];
      const city = inputs[2];

      let results = [];
      try {
        results = await searchDrugs(drugQuery, { city, limit: 3 });
      } catch (err) {
        console.error('[ussd] search failed:', err.message);
      }

      if (results.length === 0) {
        response = `END Sorry, we couldn't find ${drugQuery} near ${city} in stock right now.`;
      } else {
        response = `CON Found at ${results.length} pharmacies:
${results.map((r, i) => `${i + 1}. ${r.pharmacy_name} - ${r.unit_price == null ? 'ask' : '$' + r.unit_price.toFixed(2)}`).join('\n')}

Select a number to Reserve or 0 to cancel:`;
      }
    } else if (step === 4 && inputs[0] === '1') {
      // Reservation selection
      const selection = parseInt(inputs[3]);
      if (selection === 0) {
        response = 'END Search Cancelled.';
      } else {
        // In a real app we lookup the pharmacy from step 3 cache, here we mock:
        response = `END Reservation Confirmed! 
Reference: RX-7B9XA
We have sent an SMS with contact details for the pharmacy.`;
      }
    } else {
      response = 'END Invalid choice. Please dial again.';
    }

    // Africa's Talking expects plain text response
    res.set('Content-Type', 'text/plain');
    res.send(response);
  } catch (error) {
    console.error('USSD Error:', error);
    res.set('Content-Type', 'text/plain');
    res.send('END System error, please try again later.');
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`📡 USSD Gateway running on port ${PORT}`);
});
