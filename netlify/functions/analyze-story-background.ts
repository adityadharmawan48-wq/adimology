import { updateAgentStory } from '../../lib/supabase';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export default async (req: Request) => {
  const startTime = Date.now();
  console.log('[Agent Story] Starting background analysis with Gemini 3...');

  try {
    const url = new URL(req.url);
    const emiten = url.searchParams.get('emiten')?.toUpperCase();
    const storyId = url.searchParams.get('id');

    if (!emiten || !storyId) {
      return new Response(JSON.stringify({ error: 'Missing emiten or id' }), { status: 400 });
    }

    let keyStatsData = null;
    try {
      const body = await req.json();
      keyStatsData = body.keyStats;
    } catch (e) {
      console.log('[Agent Story] No JSON body found or invalid JSON');
    }

    if (!GEMINI_API_KEY) {
      await updateAgentStory(parseInt(storyId), {
        status: 'error',
        error_message: 'GEMINI_API_KEY not configured'
      });
      return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });
    }

    // Update status to processing
    await updateAgentStory(parseInt(storyId), { status: 'processing' });

    console.log(`[Agent Story] Analyzing ${emiten} using Gemini 3 Flash Preview (Thinking HIGH)...`);

    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    });

    const config = {
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
      },
    };

    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const model = 'gemini-3-flash-preview';
    const systemPrompt = "Kamu adalah seorang analis saham profesional Indonesia yang ahli dalam menganalisa story dan katalis pergerakan harga saham.";
    
    let keyStatsContext = '';
    if (keyStatsData) {
      keyStatsContext = `\nDATA KEY STATISTICS UNTUK ${emiten}:\n` + JSON.stringify(keyStatsData, null, 2) + '\n';
    }

    const userPrompt = `Hari ini adalah ${today}.
Cari dan analisa berita-berita TERBARU (bulan ini/minggu ini) tentang emiten saham Indonesia dengan kode ${emiten} dari internet menggunakan Google Search. 
${keyStatsContext}
FOKUS ANALISA:
1. Fokus sepenuhnya pada STORY BISNIS, AKSI KORPORASI, dan KATALIS fundamental/sentimen.
2. ABAIKAN data harga saham (price action) karena data harga dari internet seringkali tidak akurat atau delay. Jangan menyebutkan angka harga saham spesifik dalam analisis.
3. Hubungkan berita yang ditemukan dengan logika pasar: mengapa berita ini bagus atau buruk untuk masa depan perusahaan?
4. Sebutkan tanggal rilis berita yang kamu gunakan sebagai referensi di dalam deskripsi katalis.
5. Terjemahkan data Key Statistics (pahami data di atas jika tersedia) ke dalam bahasa yang mudah dipahami tapi detail untuk investasi. Berikan kesimpulan apakah data tersebut memberikan signal 'Positif/Sehat', 'Neutral', atau 'Negatif/Hati-hati' untuk investasi jangka pendek dan panjang.

Berikan analisis dalam format JSON dengan struktur berikut (PASTIKAN HANYA OUTPUT JSON, tanpa markdown code block agar mudah di-parse):
{
  "matriks_story": [
    {
      "kategori_story": "Transformasi Bisnis | Aksi Korporasi | Pemulihan Fundamental | Kondisi Makro",
      "deskripsi_katalis": "deskripsi singkat katalis",
      "logika_ekonomi_pasar": "penjelasan logika ekonomi/pasar",
      "potensi_dampak_harga": "dampak terhadap harga saham negatif/netral/positif"
    }
  ],
  "swot_analysis": {
    "strengths": ["kekuatan perusahaan"],
    "weaknesses": ["kelemahan perusahaan"],
    "opportunities": ["peluang pasar"],
    "threats": ["ancaman/risiko"]
  },
  "checklist_katalis": [
    {
      "item": "katalis yang perlu dipantau",
      "dampak_instan": "dampak jika terjadi"
    }
  ],
  "strategi_trading": {
    "tipe_saham": "jenis saham (growth/value/turnaround/dll)",
    "target_entry": "area entry yang disarankan",
    "exit_strategy": {
      "take_profit": "target take profit",
      "stop_loss": "level stop loss"
    }
  },
  "keystat_signal": "analisis data key statistics dalam bahasa awam dengan indikasi signal investasi",
  "kesimpulan": "kesimpulan analisis dalam 2-3 kalimat"
}`;

    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: `${systemPrompt}\n\n${userPrompt}`,
          },
        ],
      },
    ];

    const tools = [
      {
        googleSearch: {},
      },
    ] as any;

    const responseStream = await (ai.models as any).generateContentStream({
      model,
      config,
      contents,
      tools,
    });

    let fullText = '';
    for await (const chunk of responseStream) {
      if (chunk.text) {
        fullText += chunk.text;
      }
    }

    console.log('[Agent Story] Gemini response received via stream');

    // Parse JSON from response
    let analysisResult;
    try {
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('[Agent Story] Failed to parse response:', parseError);
      console.log('[Agent Story] Raw response:', fullText);
      await updateAgentStory(parseInt(storyId), {
        status: 'error',
        error_message: 'Failed to parse AI response'
      });
      return new Response(JSON.stringify({ error: 'Parse error' }), { status: 500 });
    }

    // Save successful result
    await updateAgentStory(parseInt(storyId), {
      status: 'completed',
      matriks_story: analysisResult.matriks_story || [],
      swot_analysis: analysisResult.swot_analysis || {},
      checklist_katalis: analysisResult.checklist_katalis || [],
      keystat_signal: analysisResult.keystat_signal || '',
      strategi_trading: analysisResult.strategi_trading || {},
      kesimpulan: analysisResult.kesimpulan || ''
    });

    const duration = (Date.now() - startTime) / 1000;
    console.log(`[Agent Story] Analysis completed for ${emiten} in ${duration}s`);

    return new Response(JSON.stringify({ success: true, emiten }), { status: 200 });

  } catch (error) {
    console.error('[Agent Story] Critical error:', error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
};
