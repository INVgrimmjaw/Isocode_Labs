import { createApp } from './app.ts';
import { config } from './lib/config.ts';

createApp().listen(config.port, () => {
  console.log(`Peti API listening on http://localhost:${config.port}`);
  if (config.demoMode) console.log('Demo mode is on: sign-in codes are shown on screen.');
  if (!config.groqApiKey) console.log('No GROQ_API_KEY: order capture will use the built-in matcher.');
});
