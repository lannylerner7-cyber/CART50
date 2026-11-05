import express, { type ErrorRequestHandler } from "express";

// Public APIs accept bounded, uncompressed JSON only. Reject encoding before
// constructing a decompressor, including requests to unknown routes.
export const requestBody = express.json({ limit: "64kb", inflate: false });
export const requestBodyErrors: ErrorRequestHandler = (error, _req, res, next) => {
  if (error?.type === "entity.too.large") {
    res.status(413).json({ error: "Request body exceeds the 64 KB limit" });
    return;
  }
  if (error?.type === "encoding.unsupported") {
    res.status(415).json({ error: "Send uncompressed application/json" });
    return;
  }
  next(error);
};
