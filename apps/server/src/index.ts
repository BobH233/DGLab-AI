import { createServerApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);

const app = await createServerApp();

app.listen(port, () => {
  console.log(`DGLabAI server listening on http://localhost:${port}`);
  console.log(`DEBUG_LLM=${process.env.DEBUG_LLM === "1" ? "enabled" : "disabled"}`);
});
