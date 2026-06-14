import { useAgentStore } from './agentStore';
import { GoogleGenAI, Modality } from '@google/genai';

const MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

export async function connectToGemini(apiKey: string) {
  console.log('Connecting to Gemini API via Experimental google/genai...');
  
  const ai = new GoogleGenAI({ apiKey });

  const session = await ai.live.connect({
    model: MODEL,
    callbacks: {
      onopen: function () {
        console.debug('WebSocket connected to Gemini Live API');
      },
      onmessage: function (message: any) {
        handleModelMessage(message, session);
      },
      onerror: function (e: any) {
        console.error('Gemini error:', e.message);
      },
      onclose: function (e: any) {
        console.log('Gemini connection closed:', e.reason);
      },
    },
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: {
        parts: [{ text: "Eres un cajero virtual amigable del Banco Futura. Puedes cambiar la pantalla del usuario e interactuar con su cuenta en tiempo real." }]
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: "get_balance",
              description: "Get the current balance of a user account",
              parameters: {
                type: "OBJECT",
                properties: {
                  userId: { type: "STRING" }
                },
                required: ["userId"]
              }
            },
            {
              name: "transfer_funds",
              description: "Transfer funds from one account to another",
              parameters: {
                type: "OBJECT",
                properties: {
                  fromId: { type: "STRING" },
                  toId: { type: "STRING" },
                  amount: { type: "NUMBER" }
                },
                required: ["fromId", "toId", "amount"]
              }
            },
            {
              name: "change_screen",
              description: "Change the active screen being displayed in the app",
              parameters: {
                type: "OBJECT",
                properties: {
                  screenName: { type: "STRING" }
                },
                required: ["screenName"]
              }
            }
          ]
        }
      ]
    },
  });

  return session;
}

export function streamAudio(session: any, base64PcmData: string) {
  if (session) {
    session.send({
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: `audio/pcm;rate=16000`,
            data: base64PcmData,
          }
        ]
      }
    });
  }
}

export function handleModelMessage(data: any, session: any) {
  try {
    // Reproducción de Audio (El agente habla)
    if (data.serverContent?.modelTurn?.parts) {
      for (const part of data.serverContent.modelTurn.parts) {
        if (part.inlineData && part.inlineData.data) {
          useAgentStore.getState().setState('speaking');
          
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const pcmData = Uint8Array.from(atob(part.inlineData.data), c => c.charCodeAt(0)).buffer;
          audioContext.decodeAudioData(pcmData, (buffer) => {
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.onended = () => {
              useAgentStore.getState().setState('idle');
            };
            source.start(0);
          }).catch((err: any) => console.error("Audio decode error:", err));
        }
        
        // Function calling (El agente piensa y llama al server)
        if (part.functionCall) {
          useAgentStore.getState().setState('thinking');
          console.log("Agent wants to execute function: ", part.functionCall.name, part.functionCall.args);
          // Llama a nuestro MCP
          executeMCPTool(part.functionCall.name, part.functionCall.args).then((result) => {
            // Enviar resultado de vuelta a la IA vía sesión
            const toolResponse = {
              toolResponse: {
                functionResponses: [
                  {
                    id: part.functionCall.id,
                    name: part.functionCall.name,
                    response: { result: result }
                  }
                ]
              }
            };
            if (session) {
               session.send(toolResponse);
            }
          });
        }
      }
    }
  } catch (err) {
    console.error("Error handling Gemini message", err);
  }
}

// Helper para mandar la herramienta al MCP via POST
async function executeMCPTool(name: string, args: any) {
  try {
    const payload = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: name,
        arguments: args
      },
      id: Date.now()
    };
    
    // Llamar al endpoint /messages de nuestro servidor Python SSE config
    const res = await fetch('http://localhost:8002/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    // El servidor HTTP retorna, aunque la rpta real va por stream en casos reales 
    // pero simularemos un fetch simple JSON para este caso.
    const textResult = await res.text();
    return textResult;
  } catch (error) {
    console.error("MCP Execution Failed: ", error);
    return JSON.stringify({ error: String(error) });
  }
}
