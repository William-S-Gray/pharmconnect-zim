async function test() {
  const email = "PLACEHOLDER_EMAIL";
  const password = "PLACEHOLDER_PASSWORD";
  const url = "PLACEHOLDER_SUPABASE_URL/auth/v1/token?grant_type=password";
  const anonKey = "PLACEHOLDER_SUPABASE_ANON_KEY";
  
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
