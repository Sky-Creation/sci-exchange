import { sessions } from "../routes/auth.js";
export const adminAuth = (req, res, next) => {
  const token = (req.headers["authorization"] || "").split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  const session = sessions.get(token);
  if (!session || Date.now() > session.expires) { sessions.delete(token); return res.status(403).json({ error: "Invalid session" }); }
  next();
};
