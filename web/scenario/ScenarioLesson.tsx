import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Headphones,
  MessageCircle,
  Play,
  RotateCcw,
  Square,
  Volume2,
} from "lucide-react";
import {
  plainJapanese,
  stages,
  type JapaneseLine,
  type MeaningQuestion,
  type SpeakingPrompt,
} from "./content.ts";
import { getScenario, scenarioCourses, getCourseUnit } from "./catalogue.ts";
import {
  focusReady,
  targetTitle,
  type FocusRun,
  type SavedAttempt,
} from "./library.ts";
import {
  addSupport,
  answerMeaning,
  meaningPracticeAdvice,
  meaningScore,
  newScenarioProgress,
  supportLabels,
  unlockedStage,
  visitStage,
  type ScenarioProgress,
  type MeaningSkill,
  type SelfRating,
} from "./progress.ts";
import { useScenarioSpeech } from "./useScenarioSpeech.ts";
import VoiceRecorder from "./VoiceRecorder.tsx";

type UpdateProgress = Dispatch<SetStateAction<ScenarioProgress>>;
type Speech = ReturnType<typeof useScenarioSpeech>;

function Japanese({
  line,
  reading = false,
  romaji = false,
  translation = false,
}: {
  line: JapaneseLine;
  reading?: boolean;
  romaji?: boolean;
  translation?: boolean;
}) {
  return (
    <div className="scenario-japanese">
      <p lang="ja">
        {line.parts.map((part, index) =>
          typeof part === "string" ? (
            part
          ) : reading ? (
            <ruby key={index}>
              {part.text}
              <rt>{part.reading}</rt>
            </ruby>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </p>
      {romaji && (
        <p className="scenario-romaji" lang="ja-Latn">
          {line.romaji}
        </p>
      )}
      {translation && (
        <p className="scenario-translation">{line.translation}</p>
      )}
    </div>
  );
}

function AudioButton({
  line,
  speech,
  disabled = false,
}: {
  line: JapaneseLine;
  speech: Speech;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="scenario-icon"
      title="朗读日文"
      aria-label={`朗读：${plainJapanese(line)}`}
      disabled={!speech.available || disabled}
      onClick={() => speech.play([plainJapanese(line)])}
    >
      <Volume2 size={19} />
    </button>
  );
}

function MeaningQuiz({
  questions,
  progress,
  onChange,
  enabled = true,
}: {
  questions: MeaningQuestion[];
  progress: ScenarioProgress;
  onChange: UpdateProgress;
  enabled?: boolean;
}) {
  return (
    <div className="scenario-quiz">
      {questions.map((question, index) => {
        const result = progress.answers[question.id];
        return (
          <fieldset key={question.id} className="scenario-question">
            <legend>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {question.prompt}
            </legend>
            <div className="scenario-choices">
              {question.options.map((option, choice) => (
                <button
                  type="button"
                  key={option}
                  disabled={!!result || !enabled}
                  aria-pressed={result?.choice === choice}
                  className={
                    result
                      ? choice === question.correct
                        ? "choice-correct"
                        : result.choice === choice
                          ? "choice-incorrect"
                          : ""
                      : ""
                  }
                  onClick={() =>
                    onChange((current) =>
                      answerMeaning(current, question.id, choice),
                    )
                  }
                >
                  <span className="scenario-option-letter">
                    {String.fromCharCode(65 + choice)}
                  </span>
                  {option}
                  {result && choice === question.correct && (
                    <Check size={16} aria-label="正确答案" />
                  )}
                </button>
              ))}
            </div>
            {result && (
              <div className="scenario-feedback" role="status">
                <strong
                  className={
                    result.choice === question.correct ? "ok-text" : "warn-text"
                  }
                >
                  {result.choice === question.correct ? "答对了" : "还需要巩固"}
                </strong>
                <span className="scenario-answer-support">
                  {result.independent
                    ? "作答前未使用提示"
                    : result.supports?.length
                      ? `作答前用过：${result.supports.map((support) => supportLabels[support]).join("、")}`
                      : "作答前使用了辅助"}
                </span>
                <p>{question.explanation}</p>
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

export function Listening({
  progress,
  onChange,
  speech,
}: {
  progress: ScenarioProgress;
  onChange: UpdateProgress;
  speech: Speech;
}) {
  const { dialogue, listeningQuestions, listeningHeading } = getScenario(
    progress.lessonId,
  );
  const [transcript, setTranscript] = useState(
    progress.supports.listening.includes("transcript"),
  );
  const [translation, setTranslation] = useState(
    progress.supports.listening.includes("translation"),
  );
  const [reading, setReading] = useState(
    progress.supports.listening.includes("reading"),
  );
  function play(slow: boolean) {
    if (slow) onChange((current) => addSupport(current, "listening", "slow"));
    speech.play(
      dialogue.map((turn) => plainJapanese(turn.line)),
      slow,
      () => onChange((current) => ({ ...current, heard: true })),
    );
  }
  return (
    <>
      <div className="scenario-audio-scene">
        <div className="scenario-audio-heading">
          <Headphones size={26} aria-hidden="true" />
          <div>
            <strong>{listeningHeading}</strong>
            <span>{dialogue.length} 段发言 · 日常交流</span>
          </div>
        </div>
        <div className="scenario-actions">
          <button
            type="button"
            className="home-primary"
            disabled={!speech.available}
            onClick={() => play(false)}
          >
            <Play size={17} />
            {progress.heard ? "再听一遍" : "播放对话"}
          </button>
          <button
            type="button"
            disabled={!speech.available}
            onClick={() => play(true)}
          >
            <Volume2 size={17} />
            慢速听
          </button>
          {speech.playing && (
            <button
              type="button"
              className="scenario-icon"
              title="停止播放"
              aria-label="停止播放"
              onClick={speech.stop}
            >
              <Square size={17} />
            </button>
          )}
        </div>
        <p className="muted" role="status">
          {speech.playing
            ? "正在播放…"
            : progress.heard
              ? "对话已播放完毕"
              : "先听对话，再判断对方的意思。"}
        </p>
      </div>
      <div className="scenario-toggles">
        <label>
          <input
            type="checkbox"
            checked={transcript}
            onChange={(event) => {
              setTranscript(event.target.checked);
              if (event.target.checked)
                onChange((current) =>
                  addSupport(current, "listening", "transcript"),
                );
            }}
          />
          日文原文
        </label>
        <label>
          <input
            type="checkbox"
            checked={translation}
            onChange={(event) => {
              setTranslation(event.target.checked);
              if (event.target.checked) {
                setTranscript(true);
                onChange((current) =>
                  addSupport(
                    addSupport(current, "listening", "transcript"),
                    "listening",
                    "translation",
                  ),
                );
              }
            }}
          />
          中文释义
        </label>
        {transcript && (
          <label>
            <input
              type="checkbox"
              checked={reading}
              onChange={(event) => {
                setReading(event.target.checked);
                if (event.target.checked)
                  onChange((current) =>
                    addSupport(current, "listening", "reading"),
                  );
              }}
            />
            假名注音
          </label>
        )}
      </div>
      {(transcript || translation) && (
        <div className="scenario-dialogue">
          {dialogue.map((turn, index) => (
            <div className="scenario-dialogue-line" key={index}>
              <span className="scenario-speaker">{turn.speaker}</span>
              <Japanese
                line={turn.line}
                reading={reading}
                translation={translation}
              />
            </div>
          ))}
        </div>
      )}
      {progress.supports.listening.length > 0 && (
        <p className="muted">
          本环节用过：
          {progress.supports.listening
            .map((support) => supportLabels[support])
            .join("、")}
        </p>
      )}
      <MeaningQuiz
        questions={listeningQuestions}
        progress={progress}
        onChange={onChange}
        enabled={
          progress.heard || progress.supports.listening.includes("transcript")
        }
      />
    </>
  );
}

function Expressions({
  speech,
  lessonId,
}: {
  speech: Speech;
  lessonId: string;
}) {
  const { expressions } = getScenario(lessonId);
  const [romaji, setRomaji] = useState(false);
  return (
    <>
      <div className="scenario-toggles">
        <label>
          <input
            type="checkbox"
            checked={romaji}
            onChange={(event) => setRomaji(event.target.checked)}
          />
          罗马音
        </label>
      </div>
      <div className="scenario-expressions">
        {expressions.map((expression) => (
          <section key={expression.purpose} className="scenario-expression">
            <div className="scenario-expression-heading">
              <h3>{expression.purpose}</h3>
              <AudioButton line={expression.line} speech={speech} />
            </div>
            <Japanese
              line={expression.line}
              reading
              romaji={romaji}
              translation
            />
            <p className="muted">{expression.note}</p>
          </section>
        ))}
      </div>
    </>
  );
}

const ratingLabels: Record<SelfRating, string> = {
  independent: "能独立表达",
  assisted: "需要参考",
  again: "还想练习",
};

export function Speaking({
  prompts,
  progress,
  onChange,
  speech,
}: {
  prompts: SpeakingPrompt[];
  progress: ScenarioProgress;
  onChange: UpdateProgress;
  speech: Speech;
}) {
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      prompts.findIndex((p) => !progress.speaking[p.id]?.rating),
    ),
  );
  const [recording, setRecording] = useState(false);
  const [romaji, setRomaji] = useState(false);
  const prompt = prompts[index];
  const result = progress.speaking[prompt.id];
  function reveal(triedFirst: boolean) {
    onChange((current) => ({
      ...current,
      speaking: {
        ...current.speaking,
        [prompt.id]: { triedFirst, revealed: true, rating: null },
      },
    }));
  }
  return (
    <>
      {prompts.length > 1 && (
        <div className="scenario-turns" aria-label="回应题目">
          {prompts.map((item, i) => (
            <button
              type="button"
              key={item.id}
              aria-current={index === i ? "step" : undefined}
              disabled={i > 0 && !progress.speaking[prompts[i - 1].id]?.rating}
              onClick={() => {
                speech.stop();
                setIndex(i);
              }}
            >
              {i + 1}. {item.title}
              {progress.speaking[item.id]?.rating && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
      <section className="scenario-speaking" aria-label={prompt.title}>
        <h3>{prompt.title}</h3>
        <p className="scenario-context">{prompt.context}</p>
        {prompt.cue && (
          <div className="scenario-cue">
            <span className="scenario-speaker">对方</span>
            <Japanese line={prompt.cue} />
            <AudioButton
              line={prompt.cue}
              speech={speech}
              disabled={recording}
            />
          </div>
        )}
        <ul className="scenario-goals">
          {prompt.goals.map((goal) => (
            <li key={goal}>{goal}</li>
          ))}
        </ul>
        <VoiceRecorder
          key={prompt.id}
          beforeRecord={speech.stop}
          onActiveChange={setRecording}
          speechPlaying={speech.playing}
        />
        {!result?.revealed ? (
          <div className="scenario-actions scenario-answer-actions">
            <button
              type="button"
              className="home-primary"
              disabled={recording}
              onClick={() => reveal(true)}
            >
              <Check size={17} />
              我已说完，查看参考
            </button>
            <button
              type="button"
              className="home-link"
              disabled={recording}
              onClick={() => reveal(false)}
            >
              <BookOpen size={17} />
              还不会，先看参考
            </button>
          </div>
        ) : (
          <div className="scenario-references">
            <div className="scenario-expression-heading">
              <h3>这些说法都可以</h3>
              <label className="scenario-check">
                <input
                  type="checkbox"
                  checked={romaji}
                  onChange={(event) => setRomaji(event.target.checked)}
                />
                罗马音
              </label>
            </div>
            {prompt.references.map((reference, i) => (
              <div className="scenario-reference" key={i}>
                <Japanese
                  line={reference}
                  reading
                  romaji={romaji}
                  translation
                />
                <AudioButton
                  line={reference}
                  speech={speech}
                  disabled={recording}
                />
              </div>
            ))}
            <p className="muted">
              对照表达要点自评，不要求逐字一致。这里不自动判断发音或语法。
            </p>
            <div
              className="scenario-ratings"
              role="group"
              aria-label="口语自评"
            >
              {(Object.keys(ratingLabels) as SelfRating[]).map((rating) => (
                <button
                  type="button"
                  key={rating}
                  aria-pressed={result.rating === rating}
                  disabled={
                    recording ||
                    (rating === "independent" && !result.triedFirst)
                  }
                  onClick={() =>
                    onChange((current) => ({
                      ...current,
                      speaking: {
                        ...current.speaking,
                        [prompt.id]: { ...current.speaking[prompt.id], rating },
                      },
                    }))
                  }
                >
                  {ratingLabels[rating]}
                </button>
              ))}
            </div>
            {!result.triedFirst && (
              <p className="muted">
                这次先看了参考，记为辅助练习；下一轮可以再独立尝试。
              </p>
            )}
          </div>
        )}
        {index < prompts.length - 1 && result?.rating && (
          <button
            type="button"
            className="home-link scenario-next-turn"
            onClick={() => {
              speech.stop();
              setIndex(index + 1);
            }}
          >
            下一个回应
            <ArrowRight size={17} />
          </button>
        )}
      </section>
    </>
  );
}

export function Reading({
  progress,
  onChange,
}: {
  progress: ScenarioProgress;
  onChange: UpdateProgress;
}) {
  const { readingMessage, readingQuestions, readingSender, readingLabel } =
    getScenario(progress.lessonId);
  const [reading, setReading] = useState(
    progress.supports.reading.includes("reading"),
  );
  const [romaji, setRomaji] = useState(
    progress.supports.reading.includes("romaji"),
  );
  const [translation, setTranslation] = useState(
    progress.supports.reading.includes("translation"),
  );
  return (
    <>
      <div className="scenario-message">
        <div className="scenario-message-heading">
          <MessageCircle size={21} />
          <strong>{readingSender}</strong>
          <span>{readingLabel}</span>
        </div>
        <Japanese
          line={readingMessage}
          reading={reading}
          romaji={romaji}
          translation={translation}
        />
      </div>
      <div className="scenario-toggles">
        {(
          [
            ["reading", "假名注音", reading, setReading],
            ["romaji", "罗马音", romaji, setRomaji],
            ["translation", "中文释义", translation, setTranslation],
          ] as const
        ).map(([support, label, checked, setter]) => (
          <label key={support}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => {
                setter(event.target.checked);
                if (event.target.checked)
                  onChange((current) =>
                    addSupport(current, "reading", support),
                  );
              }}
            />
            {label}
          </label>
        ))}
      </div>
      <MeaningQuiz
        questions={readingQuestions}
        progress={progress}
        onChange={onChange}
      />
    </>
  );
}

function MeaningReport({
  progress,
  skill,
  title,
}: {
  progress: ScenarioProgress;
  skill: MeaningSkill;
  title: string;
}) {
  const score = meaningScore(progress, skill);
  const assisted = score.correct - score.independent;
  return (
    <div role="group" aria-label={`${title}结果`}>
      <dt>{title}</dt>
      <dd>
        {score.answered === 0 ? (
          <span className="scenario-score-empty">未开始</span>
        ) : (
          <>
            <span
              className="scenario-score-value"
              aria-label={`答对 ${score.correct} / ${score.total} 题`}
            >
              <span className="scenario-score-label">答对</span>
              {score.correct} / {score.total}
            </span>
            <small>无提示答对 {score.independent} 题</small>
            <small>借助辅助答对 {assisted} 题</small>
            {score.answered < score.total && (
              <small>
                已作答 {score.answered} / {score.total} 题
              </small>
            )}
          </>
        )}
        {progress.supports[skill].length > 0 && (
          <small className="scenario-used-supports">
            本环节用过：
            {progress.supports[skill]
              .map((support) => supportLabels[support])
              .join("、")}
          </small>
        )}
      </dd>
    </div>
  );
}

export function ScenarioReport({ progress }: { progress: ScenarioProgress }) {
  const { responsePrompts, transferPrompt, listeningQuestions, transferFocus } =
    getScenario(progress.lessonId);
  const speakingPrompts = [...responsePrompts, transferPrompt];
  const oral = responsePrompts.filter(
    (p) => progress.speaking[p.id]?.rating === "independent",
  ).length;
  const transfer = progress.speaking[transferPrompt.id]?.rating;
  const finished = unlockedStage(progress) === 5;
  const comprehensionAdvice = (["listening", "reading"] as const)
    .map((skill) => meaningPracticeAdvice(progress, skill))
    .filter((advice): advice is string => advice !== null);
  const speakingToPractice = speakingPrompts.filter(
    (p) => progress.speaking[p.id]?.rating !== "independent",
  );
  return (
    <div className="scenario-report">
      <dl>
        <MeaningReport progress={progress} skill="listening" title="听懂对话" />
        <div>
          <dt>开口回应 · 自评</dt>
          <dd>
            {oral} / {responsePrompts.length}
            <small>自评可独立表达</small>
          </dd>
        </div>
        <div>
          <dt>迁移表达 · 自评</dt>
          <dd className="scenario-report-word">
            {transfer ? ratingLabels[transfer] : "未完成"}
            <small>{transferFocus}</small>
          </dd>
        </div>
        <MeaningReport progress={progress} skill="reading" title="读懂消息" />
      </dl>
      {!progress.heard &&
        listeningQuestions.some((q) => progress.answers[q.id]) && (
          <p className="scenario-notice">
            本轮未完整播放对话，听力结果仅代表借助文字的理解练习。
          </p>
        )}
      {finished && (
        <div className="scenario-next-practice">
          <h3>下一次，重点练什么</h3>
          <ul>
            {comprehensionAdvice.map((advice) => (
              <li key={advice}>{advice}</li>
            ))}
            {speakingToPractice.map((p) => (
              <li key={p.id}>{p.title}：遮住参考，用自己的话再说一遍。</li>
            ))}
            {comprehensionAdvice.length === 0 &&
              speakingToPractice.length === 0 && (
                <li>下次再试：{transferFocus}，不看参考完成表达。</li>
              )}
          </ul>
          <p className="muted">
            这是本轮表现，不等于已长期掌握；口语结果来自自评。
          </p>
        </div>
      )}
    </div>
  );
}

export default function ScenarioLesson({
  progress,
  onChange,
  saveError,
  onHome,
  onNextCourse,
  onRelatedCourse,
}: {
  progress: ScenarioProgress;
  onChange: UpdateProgress;
  saveError: boolean;
  onHome: () => void;
  onNextCourse?: () => void;
  onRelatedCourse?: (id: string) => void;
}) {
  const course = getScenario(progress.lessonId);
  const { responsePrompts, transferPrompt } = course;
  const speech = useScenarioSpeech();
  const heading = useRef<HTMLHeadingElement>(null);
  const maxStage = unlockedStage(progress);
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
    return speech.stop;
  }, [progress.stage, speech.stop]);
  function advance() {
    speech.stop();
    onChange((current) => {
      const next = {
        ...current,
        expressionsDone: current.expressionsDone || current.stage === 1,
      };
      if (unlockedStage(next) <= current.stage) return next;
      return visitStage(next, Math.min(5, current.stage + 1));
    });
  }
  return (
    <div className="scenario-lesson">
      <div className="scenario-course-heading">
        <span className="scenario-eyebrow">
          情景课 {String(scenarioCourses.indexOf(course) + 1).padStart(2, "0")}{" "}
          · {getCourseUnit(course.id).title}
        </span>
        <h1>{course.title}</h1>
        <p>{course.objective}</p>
        {course.buildsOn && onRelatedCourse && (
          <button
            type="button"
            className="home-link scenario-related-course"
            onClick={() => onRelatedCourse(course.buildsOn!)}
          >
            <BookOpen size={15} />
            温习：{getScenario(course.buildsOn).title}
          </button>
        )}
      </div>
      <nav className="scenario-steps" aria-label="情景课学习步骤">
        {stages.map((stage, index) => (
          <button
            type="button"
            key={stage}
            disabled={index > maxStage}
            aria-current={progress.stage === index ? "step" : undefined}
            onClick={() => {
              speech.stop();
              onChange((current) => visitStage(current, index));
            }}
          >
            <span>{index < maxStage ? <Check size={15} /> : index + 1}</span>
            {stage}
          </button>
        ))}
      </nav>
      {saveError && (
        <p className="scenario-notice" role="alert">
          浏览器无法保存进度；本页仍可学习，刷新后可能丢失本轮记录。
        </p>
      )}
      <section
        className="scenario-stage"
        aria-labelledby="scenario-stage-heading"
      >
        <div className="scenario-stage-heading">
          <h2 id="scenario-stage-heading" ref={heading} tabIndex={-1}>
            {stages[progress.stage]}
          </h2>
          <span className="muted">
            {Math.min(progress.stage + 1, 5)} / 5 环节
            {progress.stage === 5 ? "已完成" : ""}
          </span>
        </div>
        {!speech.available && progress.stage < 4 && (
          <p className="scenario-notice">
            未检测到日语语音。可以使用文字辅助继续学习，听力不会记为独立听懂。
          </p>
        )}
        {speech.error && (
          <p className="scenario-notice" role="alert">
            {speech.error}
          </p>
        )}
        {progress.stage === 0 && (
          <Listening progress={progress} onChange={onChange} speech={speech} />
        )}
        {progress.stage === 1 && (
          <Expressions speech={speech} lessonId={course.id} />
        )}
        {(progress.stage === 2 || progress.stage === 3) && (
          <Speaking
            key={progress.stage}
            prompts={progress.stage === 2 ? responsePrompts : [transferPrompt]}
            progress={progress}
            onChange={onChange}
            speech={speech}
          />
        )}
        {progress.stage === 4 && (
          <Reading progress={progress} onChange={onChange} />
        )}
        {progress.stage === 5 && (
          <>
            <p className="scenario-context">
              你完成了一次从听懂到回应、再到阅读的练习。
            </p>
            <ScenarioReport progress={progress} />
          </>
        )}
      </section>
      <footer className="scenario-footer">
        {progress.stage > 0 && progress.stage < 5 ? (
          <button
            type="button"
            className="home-link"
            onClick={() =>
              onChange((current) => ({ ...current, stage: current.stage - 1 }))
            }
          >
            <ArrowLeft size={17} />
            上一环节
          </button>
        ) : (
          <span className="muted">
            {progress.completedRuns > 0
              ? `已完成 ${progress.completedRuns} 轮`
              : "本浏览器保存进度"}
          </span>
        )}
        {progress.stage < 5 ? (
          <button
            type="button"
            className="home-primary"
            disabled={progress.stage !== 1 && maxStage <= progress.stage}
            onClick={advance}
          >
            {progress.stage === 4 ? "完成本轮" : "下一环节"}
            <ArrowRight size={17} />
          </button>
        ) : (
          <div className="scenario-actions">
            <button
              type="button"
              onClick={() =>
                onChange(
                  newScenarioProgress(
                    progress.completedRuns,
                    progress.lessonId,
                  ),
                )
              }
            >
              <RotateCcw size={17} />
              再练一轮
            </button>
            <button type="button" className="home-primary" onClick={onHome}>
              回到首页
              <ArrowRight size={17} />
            </button>
            {onNextCourse && (
              <button type="button" onClick={onNextCourse}>
                学习下一课
                <ArrowRight size={17} />
              </button>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

export function FocusResult({ attempt }: { attempt: SavedAttempt }) {
  if (attempt.kind !== "focus")
    return <ScenarioReport progress={attempt.progress} />;
  const rating = attempt.promptId
    ? attempt.progress.speaking[attempt.promptId]?.rating
    : null;
  return (
    <div className="scenario-report">
      {attempt.skill === "speaking" ? (
        <>
          <h3>{targetTitle(attempt)}</h3>
          <p className="scenario-context">
            本次自评：{rating ? ratingLabels[rating] : "未完成"}
          </p>
          <p className="muted">这是一次单项表达练习，不代表整节课已完成。</p>
        </>
      ) : (
        <dl>
          <MeaningReport
            progress={attempt.progress}
            skill={attempt.skill}
            title={attempt.skill === "listening" ? "听懂对话" : "读懂消息"}
          />
        </dl>
      )}
      {attempt.skill === "listening" && !attempt.progress.heard && (
        <p className="scenario-notice">
          本次未完整播放对话，结果仅代表借助文字的理解练习。
        </p>
      )}
    </div>
  );
}

export function ScenarioFocus({
  run,
  onChange,
  onFinish,
  saveError,
}: {
  run: FocusRun;
  onChange: UpdateProgress;
  onFinish: () => void;
  saveError: boolean;
}) {
  const course = getScenario(run.lessonId);
  const speech = useScenarioSpeech();
  const prompt = [...course.responsePrompts, course.transferPrompt].find(
    (p) => p.id === run.promptId,
  );
  return (
    <div className="scenario-lesson">
      <div className="scenario-course-heading">
        <span className="scenario-eyebrow">单项重练 · {course.title}</span>
        <h1>{targetTitle(run)}</h1>
      </div>
      {saveError && (
        <p role="alert" className="scenario-notice">
          本次记录暂时无法保存，刷新可能丢失。
        </p>
      )}
      {!speech.available && run.skill !== "reading" && (
        <p className="scenario-notice">
          未检测到日语语音，可以先用文字辅助练习。
        </p>
      )}
      {speech.error && (
        <p role="alert" className="scenario-notice">
          {speech.error}
        </p>
      )}
      {run.skill === "listening" && (
        <Listening
          progress={run.progress}
          onChange={onChange}
          speech={speech}
        />
      )}
      {run.skill === "reading" && (
        <Reading progress={run.progress} onChange={onChange} />
      )}
      {run.skill === "speaking" && prompt && (
        <Speaking
          prompts={[prompt]}
          progress={run.progress}
          onChange={onChange}
          speech={speech}
        />
      )}
      <footer className="scenario-footer">
        <span className="muted">独立记录本次表现</span>
        <button
          type="button"
          className="home-primary"
          disabled={!focusReady(run)}
          onClick={() => {
            speech.stop();
            onFinish();
          }}
        >
          完成单项练习
          <Check size={17} />
        </button>
      </footer>
    </div>
  );
}
