import express from 'express';
import { createClient } from '@supabase/supabase-js';
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

const supabase = createClient(process.env.SUPABASE_URL || 'http://mock', process.env.SUPABASE_SERVICE_KEY || 'mock');

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
      // Perform Supabase RPC query for the drug
      const drugQuery = inputs[1];
      const city = inputs[2];

      const { data, error } = await supabase.rpc('find_nearby_pharmacies', {
        p_query: drugQuery,
        p_lat: null, p_lng: null,
        p_radius_km: 50,
        p_city: city
      });

      if (error || !data || data.length === 0) {
        response = `END Sorry, we couldn't find ${drugQuery} near ${city} in stock right now.`;
      } else {
        const top3 = data.slice(0, 3);
        response = `CON Found at ${data.length} pharmacies:
${top3.map((r, i) => `${i + 1}. ${r.pharmacy_name} - $${r.unit_price}`).join('\n')}

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
