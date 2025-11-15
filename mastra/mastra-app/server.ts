import express, { Request, Response } from 'express';
import { mastra } from "../src/mastra"

const app = express();
const port = 8080;

// バイナリペイロードとJSONの両方を処理できるように設定
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));
app.use(express.json());

app.post('/invocations', async (req: Request, res: Response) => {
    try {
        console.log("Content-Type:", req.headers['content-type']);
        console.log("Raw body type:", typeof req.body);

        // ペイロードからテキストを抽出
        let inputText = '';
        if (Buffer.isBuffer(req.body)) {
            inputText = req.body.toString('utf-8');
            console.log("Decoded text from buffer:", inputText);
        } else if (typeof req.body === 'string') {
            inputText = req.body;
            console.log("String body:", inputText);
        } else if (req.body && typeof req.body === 'object') {
            // JSONの場合（従来の形式との互換性）
            inputText = req.body.input?.prompt || req.body.prompt || JSON.stringify(req.body);
            console.log("Extracted from JSON:", inputText);
        }

        if (!inputText || inputText.trim() === '') {
            console.error("No input text found");
            const errorMessage = "No input text provided";
            const errorBuffer = Buffer.from(errorMessage, 'utf-8');
            return res.status(400).set('Content-Type', 'application/octet-stream').send(errorBuffer);
        }

        console.log("Processing input:", inputText);

        // Mastraエージェントを実行
        const agent = mastra.getAgent("weatherAgent");
        const result = await agent.generate(inputText);

        console.log("Agent response:", result.text);

        // レスポンスをバイナリで返す
        const responseBuffer = Buffer.from(result.text, 'utf-8');
        res.set('Content-Type', 'application/octet-stream');
        res.send(responseBuffer);

    } catch (error) {
        console.error("Error processing request:", error);
        const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
        const errorBuffer = Buffer.from(errorMessage, 'utf-8');
        res.status(500).set('Content-Type', 'application/octet-stream').send(errorBuffer);
    }
});

app.get('/ping', (_req: Request, res: Response) => {
    return res.json({ status: "healthy" });
});

if (import.meta.url === `file://${process.argv[1]}`) {
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server is running at http://localhost:${port}`);
    });
}

export default app;
