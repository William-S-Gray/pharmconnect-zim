import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
// In a real app we'd use the official Paynow Node sdk: import { Paynow } from 'paynow';

dotenv.config();

/**
 * PharmConnect Escrow & Logistics Logistics Hub
 * 
 * Flow:
 * 1. App creates reservation & requests payment -> /init-escrow
 * 2. Paynow/EcoCash processes payment -> /paynow-webhook
 * 3. We notify Delivery API (e.g. Hwindi)
 * 4. Delivery completes -> /delivery-webhook
 * 5. Escrow released to Pharmacy wallet
 */

const app = express();
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL || 'http://mock', process.env.SUPABASE_SERVICE_KEY || 'mock');

// 1. Initialize Smart Escrow
app.post('/api/init-escrow', async (req, res) => {
  const { reservation_id, phone, amount, email } = req.body;

  console.log(`[ESCROW] Initializing payload for RX ${reservation_id} of $${amount}`);

  // Mock Paynow configuration
  // let paynow = new Paynow("INTEGRATION_ID", "INTEGRATION_KEY");
  // let payment = paynow.createPayment(reservation_id, email);
  // payment.add("Healthcare Escrow", amount);
  // let response = await paynow.sendMobile(payment, phone, 'ecocash');

  // Insert escrow record into Supabase pending status
  const { data, error } = await supabase.from('escrow_transactions').insert([{
    reservation_id,
    amount,
    status: 'AWAITING_PAYMENT',
    phone
  }]).select().single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    success: true,
    message: 'Check your phone for the EcoCash PIN prompt.',
    transaction_id: data.id,
    payment_link: 'http://mock-paynow.co.zw/pay/1234' // If using web flow instead of USSD prompt
  });
});

// 2. Webhook from Paynow/EcoCash signifying payment was successful
app.post('/api/paynow-webhook', async (req, res) => {
  const { reference, paynow_reference, status } = req.body; // reference is our reservation_id or transaction_id
  
  if (status !== 'Paid') return res.sendStatus(200);

  console.log(`[ESCROW] Payment received for RX ${reference}. Funds locked in Escrow.`);

  // Update status in Supabase
  await supabase.from('escrow_transactions')
    .update({ status: 'ESCROW_LOCKED', paynow_reference })
    .eq('reservation_id', reference);

  await supabase.from('drug_reservations')
    .update({ payment_status: 'PAID' })
    .eq('id', reference);

  // 3. Trigger Local Last-Mile Delivery API (Mock Hwindi/Dial-A-Delivery)
  console.log(`[LOGISTICS] Dispatching motorcycle unit for RX ${reference}`);
  // await axios.post('https://api.deliverypartner.co.zw/dispatch', { ...payload })

  res.sendStatus(200);
});

// 4. Webhook from Delivery Partner signifying patient received the drugs
app.post('/api/delivery-webhook', async (req, res) => {
  const { reservation_id, status, driver_id, pin_verified } = req.body;

  if (status !== 'DELIVERED' || !pin_verified) {
    return res.sendStatus(200);
  }

  console.log(`[LOGISTICS] Package ${reservation_id} explicitly verified and delivered.`);

  // 5. Release Escrow
  await supabase.from('escrow_transactions')
    .update({ status: 'ESCROW_RELEASED' })
    .eq('reservation_id', reservation_id);

  console.log(`[ESCROW] Funds automatically disbursed. Pharmacy: 90%, Driver: 8%, Platform: 2%`);

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`💰 Escrow + Delivery Engine running on port ${PORT}`);
});
