import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

app.use(express.json());

app.get("/", (req, res) => {
    res.sendFile(process.cwd() + "/index.html");
});

// Simple Gemini connection test
app.get("/test-ai", async (req, res) => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: "Reply with exactly: SwasthyaSetu AI OK",
        });

        res.send(response.text);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: error.message,
        });
    }
});

// Prescription image analysis
app.post(
    "/analyze-prescription",
    upload.single("prescription"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    error: "Prescription image upload karo.",
                });
            }

            const imageBase64 = req.file.buffer.toString("base64");

            const prompt = `
You are a prescription explanation assistant.

Read the uploaded prescription image carefully.

ONLY use information that is clearly visible.

Rules:
1. Identify medicine names that are clearly readable.
2. Transcribe the written instructions accurately.
3. Explain the apparent purpose only when reasonably clear.
4. NEVER guess unreadable medicine names.
5. NEVER guess dose, frequency or duration.
6. Put unreadable information in unclear_items.
7. Do not diagnose the patient.
8. Do not recommend starting, stopping, or changing medicines.

Return ONLY valid JSON.

Required structure:

{
  "medicines": [
    {
      "name": "medicine name",
      "written_instruction": "written instruction",
      "simple_explanation": "simple explanation"
    }
  ],
  "unclear_items": [],
  "safety_note": "This is an explanation of the uploaded prescription. Verify the original prescription with a qualified doctor or pharmacist."
}
`;

            const response = await ai.models.generateContent({
                model: "gemini-3.6-flash",

                contents: [
                    {
                        inlineData: {
                            data: imageBase64,
                            mimeType: req.file.mimetype,
                        },
                    },
                    {
                        text: prompt,
                    },
                ],

                config: {
                    responseMimeType: "application/json",
                },
            });

            // Gemini ka raw response
            const rawText = response.text.trim();

            console.log("========== GEMINI RESPONSE ==========");
            console.log(rawText);
            console.log("=====================================");

            // JSON ko object me convert karo
            let result;

            try {
                result = JSON.parse(rawText);
            } catch (parseError) {
                console.error("JSON parse error:", parseError);

                return res.status(500).json({
                    error: "AI ne valid analysis format return nahi kiya.",
                });
            }

            // Safety fallback
            if (!Array.isArray(result.medicines)) {
                result.medicines = [];
            }

            if (!Array.isArray(result.unclear_items)) {
                result.unclear_items = [];
            }

            if (typeof result.safety_note !== "string") {
                result.safety_note =
                    "Original prescription ko qualified doctor ya pharmacist se verify karein.";
            }

            // Final object frontend ko bhejo
            res.json({
                success: true,
                result: result,
            });

        } catch (error) {

            console.error(
                "Prescription analysis error:",
                error
            );

            res.status(500).json({
                error: error.message,
            });
        }
    }
);
// ================================
// START SERVER
// ================================

app.listen(3000, () => {
    console.log(
        "SwasthyaSetu AI running at http://localhost:3000"
    );
});