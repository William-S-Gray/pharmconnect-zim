async function test() {
  const email = "graywilliamwiltino@gmail.com";
  const password = "Will123!";
  const url = "https://tcqkklwqnhxziugtxghb.supabase.co/auth/v1/token?grant_type=password";
  const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjcWtrbHdxbmh4eml1Z3R4Z2hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDI4MDQsImV4cCI6MjA5MDg3ODgwNH0.kcWqO_2z4YTYp9ztoH_iRr83ru8Fq5Y2pvNC9jYW_5A";
  
  console.log("Testing Login...");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": anonKey,
      "Authorization": "Bearer " + anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  
  const json = await res.json();
  console.log("Login Payload from Supabase:", JSON.stringify(json, null, 2));
}

test();
