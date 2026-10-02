#!/usr/bin/env python3
"""laya-serve + POST /v1/embed, in one process (the model is loaded once).

Every route of laya-serve stays the same. Added:
  POST /v1/embed  {"texts": [...]} -> {"vectors": [[768 numbers], ...]}
Mean of Laya's encoder over the text (max 256 tokens): the input of the per-column
heads of the Planilha Preditiva (parte B, worker/learning.ts).

Optional plugin: LAYA_PLUS=<path to a .py> with `register(app, router, embed, check_key)`
adds more routes to the same process (e.g. the task-difficulty route of João's second brain).
Same LAYA_* environment as laya-serve; started by worker/laya/serve.sh.
"""
import asyncio
import hmac
import importlib.util
import os
import threading

import torch
import uvicorn
from fastapi import Header, HTTPException
from laya.serve import build_router, create_app

MODEL = "multilingual"
MAX_TEXTS = 64

router = build_router()
app = create_app(router)
api_key = os.environ.get("LAYA_API_KEY") or None
lock = threading.Lock()  # one forward pass at a time, like laya-serve


def check_key(authorization):
    if api_key is None:
        return
    supplied = (authorization or "").encode("utf-8", "surrogateescape")
    if not hmac.compare_digest(supplied, ("Bearer " + api_key).encode("utf-8", "surrogateescape")):
        raise HTTPException(status_code=401, detail="invalid or missing bearer token")


@torch.no_grad()
def embed(texts):
    """numpy array (len(texts), 768). Thread-safe."""
    agent = router.load(MODEL)
    encoder = agent.model.encoder.eval()
    with lock:
        batch = agent.tok(texts, padding=True, truncation=True, max_length=256, return_tensors="pt")
        device = next(encoder.parameters()).device
        batch = {k: v.to(device) for k, v in batch.items()}
        hidden = encoder(input_ids=batch["input_ids"], attention_mask=batch["attention_mask"]).last_hidden_state
        mask = batch["attention_mask"].unsqueeze(-1).float()
        return ((hidden * mask).sum(1) / mask.sum(1)).float().cpu().numpy()


@app.post("/v1/embed")
async def embed_route(body: dict, authorization: str = Header(None)):
    check_key(authorization)
    texts = [str(t)[:4000] for t in body.get("texts", [])]
    if not texts:
        raise HTTPException(status_code=422, detail="texts is empty")
    if len(texts) > MAX_TEXTS:
        raise HTTPException(status_code=413, detail=f"at most {MAX_TEXTS} texts per call")
    vectors = await asyncio.get_running_loop().run_in_executor(None, embed, texts)
    return {"vectors": vectors.round(6).tolist()}


def load_plugin():
    path = os.environ.get("LAYA_PLUS", "").strip()
    if not path or not os.path.isfile(path):
        return
    spec = importlib.util.spec_from_file_location("laya_plus_plugin", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.register(app, router=router, embed=embed, check_key=check_key)
    print(f"laya: plugin {path} carregado", flush=True)


load_plugin()

if __name__ == "__main__":
    uvicorn.run(app, host=os.environ.get("LAYA_HOST", "127.0.0.1"),
                port=int(os.environ.get("LAYA_PORT", "8765")),
                log_level=os.environ.get("LAYA_LOG_LEVEL", "warning"))
