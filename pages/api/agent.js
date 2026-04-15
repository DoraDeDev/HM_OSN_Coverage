// pages/api/agent.js
// Agentic layer: natural language → structured filter params → Snowflake query

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, currentFilters, availableOptions } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const systemPrompt = `You are an intelligent assistant for an MLS (Multiple Listing Service) real estate heatmap application. 
    
Your job is to interpret natural language queries and return structured filter parameters to update the map visualization.

Available filter options:
- states: ${JSON.stringify(availableOptions?.states?.slice(0, 20) || [])} (and more)
- statuses: ${JSON.stringify(availableOptions?.statuses || [])}
- propertyTypes: ${JSON.stringify(availableOptions?.propertyTypes || [])}
- osns: originating system names (MLS organizations)

Current active filters: ${JSON.stringify(currentFilters)}

When the user asks a question or gives an instruction, respond with:
1. A brief conversational reply explaining what you're doing
2. A JSON block with the updated filters

ALWAYS respond with ONLY this JSON format (no markdown, no extra text):
{
  "message": "brief explanation of what you did",
  "filters": {
    "states": ["FL", "TX"],
    "osns": [],
    "statuses": [],
    "propertyTypes": []
  },
  "action": "update_filters" | "no_change" | "explain"
}

State name to abbreviation: Florida=FL, Texas=TX, California=CA, New York=NY, Illinois=IL, Georgia=GA, North Carolina=NC, Arizona=AZ, Washington=WA, Colorado=CO, Nevada=NV, Virginia=VA, etc.

If the user asks about coverage, listings count, or wants an explanation without changing filters, use action="explain".
If nothing should change, use action="no_change".
Keep the message field concise (1-2 sentences max).`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error: ${err}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';

    // Parse the JSON response
    let parsed;
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        message: text,
        filters: currentFilters,
        action: 'explain',
      };
    }

    return res.status(200).json({ success: true, ...parsed });
  } catch (err) {
    console.error('Agent API error:', err);
    return res.status(500).json({
      error: 'Agent request failed',
      detail: err.message,
    });
  }
}
