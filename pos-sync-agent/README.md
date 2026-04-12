# PharmConnect Zero-Click POS Sync Agent

This is a standalone Node.js daemon (service) designed to run locally on a pharmacy's computer or local server. 

## The Zero-Click Moat
Most generic healthcare directories rely on humans manually updating their stock quantities. This agent creates a 10-year moat by directly integrating with local Point-of-Sale (POS) systems (like CompuCare, Pastel, or SQL/SQLite-based registers). 

Whenever a cashier rings up a drug or updates stock, this agent detects the local database mutation and securely pushes it to the PharmConnect Supabase Cloud in real-time. **Zero manual data entry.**

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in your Pharmacy ID and Supabase keys.
3. `npm run dev`

## How it Works (PoC)
Currently, it uses an in-memory SQLite database (`mock_pos.db`) to simulate a POS backend. It polls the `local_inventory` table for any row where `last_updated > lastSyncTime`. 
In a production deployment for Zimbabwe, we would swap out the SQLite driver for ODBC, `mssql`, or `mysql2` to listen to CompuCare/Pastel databases respectively.
