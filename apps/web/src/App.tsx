import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  BookOpen,
  ChevronRight,
  FlaskConical,
  GraduationCap,
  Grid2X2,
  Mic,
  MoveUpRight,
  Orbit,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { PendulumInvestigation } from '../../../packages/contracts';
import { PendulumLab } from './components/PendulumLab';
import { SoundLab } from './components/SoundLab';
import { Diagnostics } from './components/Diagnostics';
import { Notebook } from './components/Notebook';
import { listInvestigations } from './storage/notebook';
type Page = 'home' | 'sound' | 'pendulum' | 'diagnostics' | 'notebook';
function initialPage(): Page {
  const p = location.hash.slice(1);
  return ['sound', 'pendulum', 'diagnostics', 'notebook'].includes(p) ? (p as Page) : 'home';
}
export default function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const [count, setCount] = useState(0);
  const [pendulum, setPendulum] = useState<PendulumInvestigation | undefined>(undefined);
  const refresh = () => {
    void listInvestigations()
      .then((rows) => setCount(rows.length))
      .catch(() => {});
  };
  useEffect(() => {
    refresh();
    const change = () => setPage(initialPage());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  function go(next: Page) {
    location.hash = next;
    setPage(next);
    window.scrollTo(0, 0);
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <a href="#home" className="brand" aria-label="PocketLab, главная">
          <span className="brand-icon">
            <Activity size={24} />
          </span>
          <span>
            Pocket<span className="brand-light">Lab</span>
            <small>ИССЛЕДУЙ. ОТКРЫВАЙ.</small>
          </span>
        </a>
        <span className="nav-caption">ТВОЯ ЛАБОРАТОРИЯ</span>
        <nav>
          {[
            { id: 'home' as Page, label: 'Исследования', icon: Grid2X2 },
            { id: 'notebook' as Page, label: 'Мой дневник', icon: BookOpen },
            { id: 'diagnostics' as Page, label: 'Датчики', icon: Activity },
          ].map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item ${page === id || (['sound', 'pendulum'].includes(page) && id === 'home') ? 'active' : ''}`}
              key={id}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              {label}
              {id === 'notebook' && <span className="count">{count}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <ShieldCheck size={19} />
            <div>
              Данные остаются у тебя<small>Измерения без облака</small>
            </div>
          </div>
          <span className="version">POCKETLAB · ПЕРВАЯ СБОРКА</span>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            Лаборатория <ChevronRight size={14} />
            <b>
              {page === 'notebook'
                ? 'Дневник'
                : page === 'diagnostics'
                  ? 'Датчики'
                  : page === 'sound'
                    ? 'Звук'
                    : page === 'pendulum'
                      ? 'Маятник'
                      : 'Исследования'}
            </b>
          </div>
          <div className="header-right">
            <span className="language">RU</span>
            <span className="profile">
              <GraduationCap size={18} />
            </span>
          </div>
        </header>
        <main>
          {page === 'sound' ? (
            <SoundLab onBack={() => go('home')} onSaved={refresh} />
          ) : page === 'pendulum' ? (
            <PendulumLab
              key={pendulum?.id ?? 'new'}
              initial={pendulum}
              onBack={() => go('home')}
              onSaved={refresh}
            />
          ) : page === 'diagnostics' ? (
            <Diagnostics />
          ) : page === 'notebook' ? (
            <Notebook
              onStart={() => go('sound')}
              onChange={refresh}
              onResume={(record) => {
                setPendulum(record);
                go('pendulum');
              }}
            />
          ) : (
            <>
              <div className="page-heading home-heading">
                <div>
                  <div className="eyebrow">БОЛЬШИЕ ОТКРЫТИЯ НАЧИНАЮТСЯ С ВОПРОСА</div>
                  <h1>Что исследуем сегодня?</h1>
                  <p>Твой телефон. Настоящие данные. Собственные открытия.</p>
                </div>
                <button className="secondary" onClick={() => go('diagnostics')}>
                  <Activity size={17} />
                  Проверить датчики
                </button>
              </div>
              <section className="featured">
                <div className="featured-copy">
                  <span className="feature-tag">
                    <Sparkles size={15} /> ПЕРВЫЙ ЭКСПЕРИМЕНТ
                  </span>
                  <h2>
                    У звука есть форма.
                    <br />
                    Давай её увидим.
                  </h2>
                  <p>
                    Произнеси звук, измени его высоту и посмотри, как твой голос превращается в
                    спектрограмму.
                  </p>
                  <div className="feature-meta">
                    <span>
                      <Mic size={15} /> Микрофон
                    </span>
                    <span>3–5 минут</span>
                    <span>Без оборудования</span>
                  </div>
                  <button className="lime-button" onClick={() => go('sound')}>
                    Исследовать звук <ArrowRight size={19} />
                  </button>
                </div>
                <div
                  className="featured-visual"
                  aria-label="Иллюстрация спектра, не измеренные данные"
                >
                  <span className="visual-label">
                    ЧАСТОТА / ВРЕМЯ <span>ИЛЛЮСТРАЦИЯ</span>
                  </span>
                  <svg viewBox="0 0 430 230" role="img" aria-label="Схематический спектр звука">
                    <defs>
                      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                        <stop stopColor="#c2ff7d" stopOpacity=".35" />
                        <stop offset="1" stopColor="#c2ff7d" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {[45, 90, 135, 180, 225].map((y) => (
                      <path key={y} d={`M0 ${y}H430`} stroke="#ffffff12" />
                    ))}
                    {[30, 100, 170, 240, 310, 380].map((x) => (
                      <path key={x} d={`M${x} 0V230`} stroke="#ffffff10" />
                    ))}
                    <path
                      d="M0 185L15 182L24 190L33 161L39 184L54 174L63 181L73 145L80 187L96 162L107 181L118 92L129 180L138 148L145 170L157 38L166 179L176 144L186 165L194 67L204 178L216 130L224 169L234 105L243 178L254 148L264 168L275 132L284 180L296 157L306 181L317 167L329 186L338 171L350 182L362 170L376 184L389 180L410 186L430 184V230H0Z"
                      fill="url(#fade)"
                    />
                    <path
                      d="M0 185L15 182L24 190L33 161L39 184L54 174L63 181L73 145L80 187L96 162L107 181L118 92L129 180L138 148L145 170L157 38L166 179L176 144L186 165L194 67L204 178L216 130L224 169L234 105L243 178L254 148L264 168L275 132L284 180L296 157L306 181L317 167L329 186L338 171L350 182L362 170L376 184L389 180L410 186L430 184"
                      fill="none"
                      stroke="#c2ff7d"
                      strokeWidth="2"
                    />
                  </svg>
                  <div className="visual-bottom">
                    <span>Каждый голос — свой рисунок</span>
                    <AudioLines size={21} />
                  </div>
                </div>
              </section>
              <div className="section-heading">
                <h2>Три способа увидеть физику</h2>
                <span>Выбери свой инструмент</span>
              </div>
              <div className="lab-cards">
                <button className="lab-card available" onClick={() => go('sound')}>
                  <div className="card-top">
                    <span className="lab-icon green">
                      <AudioLines size={25} />
                    </span>
                    <span className="availability">Доступно</span>
                  </div>
                  <span className="card-number">01 / ЗВУК</span>
                  <h3>Увидь невидимое</h3>
                  <p>Спектр, частота и голос. Проверь, означает ли громче — выше.</p>
                  <span className="card-link">
                    Открыть лабораторию
                    <MoveUpRight size={17} />
                  </span>
                </button>
                <button
                  className="lab-card available"
                  onClick={() => {
                    setPendulum(undefined);
                    go('pendulum');
                  }}
                >
                  <div className="card-top">
                    <span className="lab-icon blue">
                      <Orbit size={25} />
                    </span>
                    <span className="availability">Доступно</span>
                  </div>
                  <span className="card-number">02 / ДВИЖЕНИЕ</span>
                  <h3>Открой закон маятника</h3>
                  <p>Измени длину, измерь период и найди закономерность.</p>
                  <span className="card-link">
                    Исследовать маятник
                    <MoveUpRight size={17} />
                  </span>
                </button>
                <article className="lab-card">
                  <div className="card-top">
                    <span className="lab-icon orange">
                      <ScanLine size={25} />
                    </span>
                    <span className="availability pending">Следующий этап</span>
                  </div>
                  <span className="card-number">03 / ВИДЕО</span>
                  <h3>Поймай движение</h3>
                  <p>Преврати видео падения мяча в траекторию и график ускорения.</p>
                  <span className="card-footer">Готовится · разметка и трекинг</span>
                </article>
              </div>
              <section className="research-loop">
                <div>
                  <span className="eyebrow">ТЫ В РОЛИ ИССЛЕДОВАТЕЛЯ</span>
                  <h2>
                    Здесь нет готовых ответов.
                    <br />
                    Есть твои открытия.
                  </h2>
                </div>
                <div className="loop-step">
                  <span>01</span>
                  <b>Предположи</b>
                  <p>Что, по-твоему, произойдёт?</p>
                </div>
                <ArrowRight className="loop-arrow" size={20} />
                <div className="loop-step">
                  <span>02</span>
                  <b>Проверь</b>
                  <p>Проведи настоящий опыт.</p>
                </div>
                <ArrowRight className="loop-arrow" size={20} />
                <div className="loop-step">
                  <span>03</span>
                  <b>Объясни</b>
                  <p>Сохрани свой вывод.</p>
                </div>
              </section>
              <footer className="home-footer">
                <span>
                  <FlaskConical size={16} /> Практическая физика без сложного оборудования
                </span>
                <button onClick={() => go('notebook')}>
                  <ArrowDownToLine size={16} />
                  Твои измерения в дневнике
                </button>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
