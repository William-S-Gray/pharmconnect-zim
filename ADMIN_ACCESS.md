# Admin Access Guide (Supabase)

To manage PharmConnect-Zim, you need an administrative account. For security, only users with the `admin` role in their identity metadata can access the `/admin` routes.

## Creating the First Admin User

Since RLS is enabled, you must create the first administrator directly via the **Supabase Dashboard**.

### Step 1: Create a User Account
1. Go to your **Supabase Dashboard** -> **Authentication**.
2. Click **Add User** -> **Create New User**.
3. Enter an email (e.g., `admin@pharmtrack.co.zw`) and a strong password.

### Step 2: Elevate to Admin Role
1. Go to the **SQL Editor** in your Supabase Dashboard.
2. Run the following query to set the `admin` role in the user's `raw_app_meta_data`:

```sql
-- Replace the email below with the email of the admin user you just created
UPDATE auth.users 
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'
WHERE email = 'admin@pharmtrack.co.zw';
```

3. (Optional) You can also set a flag in the `pharmacies` table if you want this user to appear as an admin there (though `auth.users` is the source of truth for the `AdminRoute`):

```sql
UPDATE public.pharmacies
SET role = 'admin'
WHERE email = 'admin@pharmtrack.co.zw';
```

## Admin Features
Once logged in as an admin at `/pharmacy/login`, you can access:
- **Dashboard Overview**: Total pharmacies, drugs, and pending tasks.
- **Approvals**: Vett new pharmacy registrations.
- **Master Drug Database**: Manage the global list of drugs available for all pharmacies.
- **User Management**: Monitor and manage all pharmacy accounts.
- **Analytics**: System-wide growth and search trends.
- **Security Audit**: View global system logs.

> [!IMPORTANT]
> The admin role is checked at the network layer via Supabase RLS and at the UI layer via the `AdminRoute` component. Never share administrative credentials.
