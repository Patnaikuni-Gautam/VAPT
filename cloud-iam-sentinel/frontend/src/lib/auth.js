const BASE_URL = "http://localhost:5000/api/auth";

// Verify if user is logged in
export async function verifyUser() {
  const res = await fetch(`${BASE_URL}/verify`, {
    method: "GET",
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("User not authenticated");
  }

  return res.json(); // { user: { id, ... } }
}
