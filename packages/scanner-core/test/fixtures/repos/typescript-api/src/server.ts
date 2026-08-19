import express from "express";

const app = express();

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.listen(process.env.PORT ?? 3000);
