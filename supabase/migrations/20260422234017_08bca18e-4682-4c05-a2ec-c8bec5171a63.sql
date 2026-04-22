-- Documents
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  page_count INT DEFAULT 0,
  full_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_session ON public.documents(session_id);

-- Chunks
CREATE TABLE public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  chunk_index INT NOT NULL,
  page INT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chunks_document ON public.document_chunks(document_id);
CREATE INDEX idx_chunks_session ON public.document_chunks(session_id);

-- Analysis cache (summary, risks, entities)
CREATE TABLE public.analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  kind TEXT NOT NULL, -- 'summary' | 'risks' | 'entities'
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, kind)
);

-- Q&A history
CREATE TABLE public.qa_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qa_document ON public.qa_history(document_id);

-- RLS: open access (session_id acts as the secret)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_all" ON public.documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_all" ON public.document_chunks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_all" ON public.analysis_results FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_all" ON public.qa_history FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('legal-docs', 'legal-docs', false);

CREATE POLICY "anon read legal-docs" ON storage.objects FOR SELECT USING (bucket_id = 'legal-docs');
CREATE POLICY "anon write legal-docs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'legal-docs');
CREATE POLICY "anon update legal-docs" ON storage.objects FOR UPDATE USING (bucket_id = 'legal-docs');
CREATE POLICY "anon delete legal-docs" ON storage.objects FOR DELETE USING (bucket_id = 'legal-docs');