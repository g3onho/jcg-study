import { useState } from 'preact/hooks';
import { Md, Code, Table, SignedImg } from './ui.jsx';

export const LANG_LABEL = { c: 'C', java: 'Java', python: 'Python', sql: 'SQL' };

export function AnswerInput({ spec, ans, update }) {
  if (spec.mode === 'parts') {
    return (
      <div class="partsin">
        {spec.parts.map((pt, i) => (
          <label key={i} class="partin"><span>{pt.label || '답'}</span>
            <input type="text" autoComplete="off" autoCapitalize="off" spellcheck={false} value={ans.parts[i] || ''}
              onInput={e => { const parts = [...ans.parts]; parts[i] = e.target.value; update({ ...ans, parts }); }} />
          </label>
        ))}
      </div>
    );
  }
  return (
    <textarea class="mono" rows={spec.mode === 'self' ? 6 : 4} autoComplete="off" autoCapitalize="off" spellcheck={false} aria-label="답안 입력"
      placeholder={spec.mode === 'output' ? '출력 결과를 그대로 입력 (줄바꿈·공백 포함)' : '답안 입력'}
      value={ans.text} onInput={e => update({ ...ans, text: e.target.value })} />
  );
}

// 문제 본문(원본 표기·지문·표·코드·원문 이미지). 힌트·정답은 포함하지 않는다.
export function QuestionBody({ p }) {
  const [showImg, setShowImg] = useState(!!p.prefer_image && !!p.image);
  return (
    <div class="qbody">
      {p.notice && <div class="notice small"><b>원본 표기</b> {p.notice}</div>}
      {p.reconstructed && <div class="alert warn small"><b>AI 재구성 문항</b> — {p.reconstructed}</div>}
      {(!showImg || !p.image) && <Md text={p.prompt} />}
      {(!showImg || !p.image) && p.tables && p.tables.map((t, i) => <Table key={i} {...t} />)}
      {(!showImg || !p.image) && p.code && <Code code={p.code} lang={LANG_LABEL[p.lang] || ''} />}
      {showImg && p.image && <SignedImg path={p.image} alt={`${p.setTitle} ${p.no}번 문제 원문`} />}
      {p.image && <button class="linkbtn small" onClick={() => setShowImg(!showImg)}>{showImg ? '텍스트로 보기' : '원문 이미지로 보기'}{p.prefer_image && !showImg ? ' (표·그림은 원문 이미지가 정확합니다)' : ''}</button>}
    </div>
  );
}
