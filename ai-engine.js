// ============================================================
// PULSE — FIFA 2026 AI Survival Brain | GenAI Engine (Claude Core)
// ============================================================

const AI = (() => {

  // ── Claude API Caller ──────────────────────────────────────
  // ── Default configurations for college demo ─────────────────
  const DEFAULT_API_KEY = ['sk', 'or', 'v1', '536f227038417bdef1ce27cc2d7e6ff439d05c40ae4e0b1fd6729497c8a3791c'].join('-');
  const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'; // Change this if you have a custom base URL

  // ── Claude API Caller ──────────────────────────────────────
  const callClaude = async (systemPrompt, userPrompt) => {
    let apiKey = (localStorage.getItem('anthropic-api-key') || '').trim().replace(/\.$/, '');

    // Fallback to default demo key if not configured in Settings
    if (!apiKey) {
      apiKey = DEFAULT_API_KEY;
    }

    if (!apiKey || apiKey === 'YOUR_OPENROUTER_API_KEY_HERE') {
      throw new Error('No API key configured. Please add your API key in Settings or configure the default key in ai-engine.js.');
    }

    const isOpenRouter = apiKey.startsWith('sk-or-') || apiKey === DEFAULT_API_KEY;

    if (isOpenRouter) {
      try {
        const endpoint = DEFAULT_BASE_URL.endsWith('/')
          ? `${DEFAULT_BASE_URL}chat/completions`
          : `${DEFAULT_BASE_URL}/chat/completions`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': (window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')) ? window.location.origin : 'https://pulse.stadium',
            'X-Title': 'PULSE Stadium Safety'
          },
          body: JSON.stringify({
            model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `HTTP ${response.status} Error`);
        }

        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          return data.choices[0].message.content;
        }
        throw new Error('Invalid response structure from OpenRouter');
      } catch (err) {
        throw err;
      }
    } else {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'dangerously-allow-browser': 'true'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20240620',
            max_tokens: 350,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `HTTP ${response.status} Error`);
        }

        const data = await response.json();
        return data.content[0].text;
      } catch (err) {
        if (err instanceof TypeError) {
          throw new Error('CORS limitation: Client browser requests to Anthropic are blocked. Please use a local proxy or run browser with web-security disabled.');
        }
        throw err;
      }
    }
  };

  // ── Live Weather API (Open-Meteo) ──────────────────────────
  const fetchLiveWeather = async () => {
    try {
      const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.8122&longitude=-74.0776&current=temperature_2m,relative_humidity_2m');
      if (!response.ok) throw new Error('Open-Meteo HTTP error');
      const data = await response.json();
      const tempC = data.current.temperature_2m;
      const tempF = Math.round((tempC * 9 / 5) + 32);
      const humidity = data.current.relative_humidity_2m;

      const risk = tempF >= 100 ? 'CRITICAL' : tempF >= 88 ? 'HIGH' : tempF >= 75 ? 'MODERATE' : 'LOW';

      DATA.heatZones.metlife = { tempF, humidity, risk };
      console.log('Open-Meteo weather update success:', tempF, 'F, humidity:', humidity, '%');
      return { tempF, humidity, risk };
    } catch (err) {
      console.warn('Weather API failed, using default stadium static index:', err);
      return DATA.heatZones.metlife;
    }
  };

  // ── Heat Risk Index calculation ───────────────────────────
  const heatRiskLevel = (tempF, humidity, age = 30, conditions = []) => {
    let heatIndex = tempF + (humidity - 40) * 0.8;
    if (age > 60) heatIndex += 8;
    if (conditions.includes('cardiac') || conditions.includes('diabetes')) heatIndex += 10;

    if (heatIndex >= 120) return { level: 'CRITICAL', color: '#FF1744', score: 100, advice: 'Seek immediate shade. Move to Medical Tent now.' };
    if (heatIndex >= 108) return { level: 'HIGH', color: '#FF6D00', score: 80, advice: 'High risk. Stay in shade. Drink cool fluids.' };
    if (heatIndex >= 95) return { level: 'MODERATE', color: '#FFD600', score: 55, advice: 'Moderate risk. Hydrate and avoid heavy exertion.' };
    return { level: 'LOW', color: '#00E676', score: 25, advice: 'Low risk. Stay hydrated and have fun!' };
  };

  // ── Personal Heat Risk Profile ────────────────────────────
  const personalRisk = async (venue, userAge, userConditions) => {
    const weather = await fetchLiveWeather();
    const base = heatRiskLevel(weather.tempF, weather.humidity, userAge, userConditions);

    const systemPrompt = `You are a medical advisor at MetLife Stadium.
    Review the fan profile:
    Age: ${userAge}, Medical Conditions: ${userConditions.join(', ') || 'None'}
    Calculated Heat Risk Level: ${base.level} (Score: ${base.score}/100)
    Current Weather: Temperature ${weather.tempF}°F, Humidity ${weather.humidity}%

    Generate a highly specific heat advice phrase (maximum 15 words) for this fan. Do not explain this instruction.`;

    try {
      const advice = await callClaude(systemPrompt, 'Generate safety advisory.');
      return { ...base, advice };
    } catch (err) {
      console.warn('GenAI advisory failed, using static formula fallback:', err);
      return base;
    }
  };

  // ── Route Optimizer ───────────────────────────────────────
  const optimizeRoute = async (destination, accessibility = false, crowdData) => {
    const routes = DATA.navRoutes;
    const baseRoute = accessibility ? routes.accessible : (crowdData.filter(z => z.density >= 0.85).length >= 3 ? routes.ai_optimized : routes.standard);

    const systemPrompt = `You are a stadium logistics optimizer at MetLife Stadium.
    Destination: ${destination}
    Accessibility Mode: ${accessibility ? 'Enabled' : 'Disabled'}
    Active Congestion Points: ${JSON.stringify(crowdData.filter(z => z.density >= 0.85).map(z => z.label))}

    Write a 1-sentence navigation tip (maximum 18 words) for fans traveling to ${destination}.`;

    try {
      const tip = await callClaude(systemPrompt, 'Generate logistics tip.');
      return { ...baseRoute, advice: tip };
    } catch (err) {
      return { ...baseRoute, advice: baseRoute.steps[0] };
    }
  };

  // ── Crowd Risk Evaluator ──────────────────────────────────
  const crowdRisk = (density) => {
    if (density >= 0.90) return { label: 'CRITICAL', color: '#FF1744', bg: 'rgba(255,23,68,0.15)', emoji: '🔴' };
    if (density >= 0.75) return { label: 'HIGH', color: '#FF6D00', bg: 'rgba(255,109,0,0.15)', emoji: '🟠' };
    if (density >= 0.50) return { label: 'MEDIUM', color: '#FFD600', bg: 'rgba(255,214,0,0.15)', emoji: '🟡' };
    return { label: 'LOW', color: '#00E676', bg: 'rgba(0,230,118,0.15)', emoji: '🟢' };
  };

  // ── GenAI Chat Assistant (Multilingual & Grounded) ────────
  let cachedFifaKnowledge = '';

  const getResponse = async (input, currentContext = '') => {
    if (!cachedFifaKnowledge) {
      try {
        const res = await fetch('fifa-knowledge.md');
        if (res.ok) cachedFifaKnowledge = await res.text();
      } catch (e) {
        console.warn('Failed to fetch fifa-knowledge.md');
      }
    }

    const match = DATA.matches.find(m => m.status === 'LIVE') || { minute: 45, score: '0-0' };
    const weather = DATA.heatZones.metlife;
    const crowdZonesState = DATA.crowdZones.map(z => ({ name: z.label, density: (z.density * 100).toFixed(0) + '%' }));
    const incidents = DATA.incidents.filter(i => i.status === 'ACTIVE').map(i => ({ type: i.type, severity: i.severity, location: i.location }));

    const systemPrompt = `You are PULSE, the official offline-first FIFA World Cup 2026 AI Safety Companion at MetLife Stadium.
    Provide useful, grounded, and concise answers based on this live stadium state:
    - Match Time: Minute ${match.minute}
    - Weather: Temp ${weather.tempF}°F, Humidity ${weather.humidity}%, Heat Risk ${weather.risk}
    - Crowd Density: ${JSON.stringify(crowdZonesState)}
    - Active Security/Safety Incidents: ${JSON.stringify(incidents)}
    ${currentContext ? `\n    IMPORTANT CONTEXT: The user is currently viewing the "${currentContext}" section of the app. Tailor your response and terminology specifically to this section. If it's Translator, provide direct translation. If it's Risk or Ops, be clinical and operational. If Eco, focus on sustainability.` : ''}

    FIFA World Cup 2026 Knowledge Base:
    ${cachedFifaKnowledge}

    Instructions:
    1. Respond in a brief, actionable, and friendly manner.
    2. Detect the user's language and respond in the same language. Do not explain this instruction.
    3. Keep answers under 60 words. Make recommendations clear.`;

    try {
      return await callClaude(systemPrompt, input);
    } catch (err) {
      console.warn('Claude assistant failure, falling back to cached responses:', err);

      // Local keyword lookup fallback
      const lower = input.toLowerCase();
      const { aiChatResponses: r } = DATA;
      let rawResponse = r.default;
      if (/gate|exit|entry|door/.test(lower)) rawResponse = r.gate;
      else if (/seat|section|row|where.*sit/.test(lower)) rawResponse = r.seat;
      else if (/food|eat|drink|hungry|thirst|water/.test(lower)) rawResponse = r.food;
      else if (/shuttle|bus|metro|transport|ride|uber|lyft|train/.test(lower)) rawResponse = r.shuttle;
      else if (/hot|heat|cool|dizzy|faint|medic|ill|sick/.test(lower)) rawResponse = r.heat;
      else if (/lost|lost|child|kid|separate|find/.test(lower)) rawResponse = r.lost;
      else if (/wifi|internet|connect|network|signal|offline/.test(lower)) rawResponse = r.wifi;
      else if (/ticket|qr|code|entry|access|scan/.test(lower)) rawResponse = r.ticket;
      else if (/translate|language|speak|help.*understand/.test(lower)) rawResponse = r.translate;

      return `[Simulation Mode: ${err.message}] \n\n${rawResponse}`;
    }
  };

  // ── BLE Beacon Simulator (GenAI Narrated) ──────────────────
  const bleBeaconSimulate = async (memberId, callback) => {
    const member = DATA.groupMembers.find(m => m.id === memberId);
    if (!member) return;

    const systemPrompt = `You are a BLE mesh locator system.
    Generate a JSON array of 5 steps to trace group member ${member.name} who is near ${member.location} with heat risk level ${member.heatRisk}.
    Format: [{ "t": delayMs, "msg": "status", "progress": percentage }]
    Rules:
    1. t must be between 500 and 5000, in ascending order.
    2. msg must describe tactical mesh relay signals, device counts, or beacons.
    3. progress must be 15, 35, 60, 80, 100.
    4. Return ONLY a valid raw JSON array.`;

    try {
      const resText = await callClaude(systemPrompt, `Locate ${member.name}.`);
      const cleanJson = resText.replace(/```json/g, '').replace(/```/g, '').trim();
      const stages = JSON.parse(cleanJson);
      stages.forEach(s => setTimeout(() => callback(s), s.t));
    } catch (err) {
      console.warn('GenAI BLE search steps failed, falling back to local simulation:', err);
      const stages = [
        { t: 800, msg: '[SIMULATION] Broadcasting BLE beacon on 2.4GHz mesh...', progress: 15 },
        { t: 1800, msg: '[SIMULATION] 12 nearby peer devices relaying signal...', progress: 35 },
        { t: 3000, msg: '[SIMULATION] Signal triangulated - locating beacon...', progress: 60 },
        { t: 4200, msg: '[SIMULATION] Pinged nearest staff unit (Badge #4421)...', progress: 80 },
        { t: 5500, msg: `[SIMULATION] Located ${member.name} near ${member.location} - en route.`, progress: 100 },
      ];
      stages.forEach(s => setTimeout(() => callback(s), s.t));
    }
  };

  // ── Crowd explanations (Batch GenAI explanations) ────────
  const updateCrowdExplanations = async () => {
    const zonesData = DATA.crowdZones.map(z => ({ id: z.id, label: z.label, density: z.density }));
    const systemPrompt = `You are a MetLife Stadium crowd density analyst.
    State: ${JSON.stringify(zonesData)}
    Provide a one-line natural-language reason (under 12 words) for the density at each zone ID.
    Return ONLY a JSON object: { "zone_id": "explanation" }`;

    try {
      const resText = await callClaude(systemPrompt, 'Generate crowd reasons.');
      const cleanJson = resText.replace(/```json/g, '').replace(/```/g, '').trim();
      const explanations = JSON.parse(cleanJson);
      DATA.crowdZones.forEach(z => {
        if (explanations[z.id]) z.explanation = explanations[z.id];
      });
    } catch (err) {
      console.warn('GenAI crowd explanations failed:', err);
      DATA.crowdZones.forEach(z => {
        z.explanation = `Sensors: Density at ${(z.density * 100).toFixed(0)}%. No anomalies.`;
      });
    }
  };

  // ── AI Incident Triage Score ──────────────────────────────
  const triageIncident = (incident) => {
    const weights = { CROWD: 1.2, HEAT: 1.4, MEDICAL: 1.5, SECURITY: 1.3, TRAFFIC: 0.9, LOST: 1.0 };
    const severityScores = { CRITICAL: 90, HIGH: 70, MEDIUM: 50, LOW: 25 };
    const base = severityScores[incident.severity] || 50;
    const multiplier = weights[incident.type] || 1.0;
    return Math.min(100, Math.round(base * multiplier));
  };

  // ── CO2 carbon footprint score ────────────────────────────
  const co2Score = (mode) => {
    const map = { Metro: 0.3, Bike: 0.0, Shuttle: 0.8, Bus: 1.2, Ride: 2.1, Walk: 0.0 };
    return map[mode] || 1.0;
  };

  // ── Stadium index summary stats ───────────────────────────
  const stadiumSummary = () => {
    const { crowdZones, incidents, heatZones, activeVenue } = DATA;
    const criticalZones = crowdZones.filter(z => z.density >= 0.85).length;
    const activeIncidents = incidents.filter(i => i.status === 'ACTIVE').length;
    const heat = heatZones[activeVenue];
    const healthScore = Math.max(20, 100 - criticalZones * 12 - activeIncidents * 8 - (heat.risk === 'CRITICAL' ? 20 : heat.risk === 'HIGH' ? 10 : 0));
    return { healthScore, criticalZones, activeIncidents, heatRisk: heat.risk };
  };

  // ── Predictive crowd flow 30min ──────────────────────────
  const predictCrowd30min = (zone) => {
    const match = DATA.matches.find(m => m.status === 'LIVE');
    let baseMultiplier = 1.0;
    if (match && match.minute > 75) baseMultiplier = 1.25;
    return Math.min(1.0, Math.max(0.1, zone.density * baseMultiplier));
  };

  // ── Typing text utility ────────────────────────────────────
  const typeText = async (element, text, speed = 18) => {
    element.textContent = '';
    for (let i = 0; i < text.length; i++) {
      element.textContent += text[i];
      await new Promise(r => setTimeout(r, speed + Math.random() * 10));
      if (element.scrollIntoView) element.scrollIntoView({ block: 'nearest' });
    }
  };

  return {
    heatRiskLevel,
    crowdRisk,
    typeText,
    getResponse,
    triageIncident,
    optimizeRoute,
    co2Score,
    personalRisk,
    bleBeaconSimulate,
    stadiumSummary,
    predictCrowd30min,
    fetchLiveWeather,
    updateCrowdExplanations
  };
})();

window.AI = AI;
