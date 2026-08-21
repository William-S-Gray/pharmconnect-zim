import express from 'express';
import pg from 'pg';
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

/**
 * Direct Postgres access.
 *
 * This service receives payment and delivery webhooks and settles escrow —
 * it acts on behalf of the platform, not a signed-in user, so there is no
 * session for it to hold. It connects with its own database credentials
 * rather than the Supabase service-role key it used before, which granted
 * blanket access to every table in the system.
 */
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (err) => console.error('[escrow] idle client error', err));

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
  let data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO escrow_transactions (reservation_id, amount, status, phone)
       VALUES ($1, $2, 'AWAITING_PAYMENT', $3) RETURNING *`,
      [reservation_id, amount, phone],
    );
    data = rows[0];
  } catch (err) {
    console.error('[escrow] insert failed:', err.message);
    // The message is not echoed to the caller: this is a webhook-facing
    // service and Postgres errors quote table names and values.
    return res.status(500).json({ error: 'Could not initialise payment' });
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

  // Both updates in one transaction: money marked as locked without the
  // reservation marked paid (or the reverse) is a reconciliation problem
  // nobody notices until a patient is turned away at the counter.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE escrow_transactions SET status = 'ESCROW_LOCKED', provider_ref = $2
        WHERE reservation_id = $1`,
      [reference, paynow_reference],
    );
    await client.query(
      `UPDATE drug_reservations SET payment_status = 'PAID' WHERE id = $1`,
      [reference],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[escrow] payment webhook failed:', err.message);
    // 500 so the payment provider retries rather than treating this as
    // settled. Returning 200 here would lose the payment silently.
    return res.sendStatus(500);
  } finally {
    client.release();
  }

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

  // 5. Release escrow. Conditioned on the current status so a replayed
  //    webhook cannot release the same funds twice.
  try {
    const { rowCount } = await pool.query(
      `UPDATE escrow_transactions SET status = 'ESCROW_RELEASED'
        WHERE reservation_id = $1 AND status = 'ESCROW_LOCKED'`,
      [reservation_id],
    );
    if (rowCount === 0) {
      console.warn(`[escrow] no locked escrow for ${reservation_id}; ignoring`);
      return res.sendStatus(200);
    }
  } catch (err) {
    console.error('[escrow] release failed:', err.message);
    return res.sendStatus(500);
  }

  console.log(`[ESCROW] Funds automatically disbursed. Pharmacy: 90%, Driver: 8%, Platform: 2%`);

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`💰 Escrow + Delivery Engine running on port ${PORT}`);
});
