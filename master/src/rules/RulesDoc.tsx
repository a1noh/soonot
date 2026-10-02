/**
 * 윷놀이 규칙 + 진행 안내 — the handoff document (VBS 꿈당).
 *
 * The lists and numbers here are **imported from the engine**, never retyped:
 * `ROLL_STEPS`, `BONUS_ROLLS`, `MINIGAME_STATIONS`, `DUEL_GAMES` and `MINI_GAMES`
 * are the same values `apply.ts` reduces over, so this page cannot drift from the
 * rules the server actually enforces.
 *
 * Written to be READ WHILE RUNNING THE GAME, which is why it is terse: every
 * sentence is a rule or an instruction, and nothing explains why the rule exists.
 * A leader scanning this mid-turn needs the answer, not the reasoning.
 *
 * Rendered in two places (one component, one truth): a tab inside `/master` and
 * the passcode-free `/rules` page that 꿈당 leaders open on their own phones.
 */

import {
  BONUS_ROLLS,
  DUEL_GAMES,
  MINIGAME_STATIONS,
  ROLLS,
  ROLL_STEPS,
} from '@soonot/yutnori/src/shared/constants.js';
import { MINI_GAMES } from '@soonot/yutnori/src/shared/minigames.js';
import { Qr } from '../shared/Qr.js';
import './rules.css';

/** The 미니게임 칸 grouped the way the board reads, so a leader can point at them. */
const STATION_GROUPS: readonly { label: string; nodes: readonly number[] }[] = [
  { label: '바깥 길', nodes: MINIGAME_STATIONS.filter((n) => n <= 19) },
  { label: '지름길', nodes: MINIGAME_STATIONS.filter((n) => n >= 21 && n !== 23) },
  { label: '방 (가운데)', nodes: MINIGAME_STATIONS.filter((n) => n === 23) },
];

function rulesUrl(): string {
  return typeof window !== 'undefined' ? `${window.location.origin}/rules` : '/rules';
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rules__step">
      <span className="rules__stepNum" aria-hidden="true">{n}</span>
      <div>
        <h4 className="rules__stepTitle">{title}</h4>
        <div className="rules__stepBody">{children}</div>
      </div>
    </li>
  );
}

export function RulesDoc({ showQr = true }: { showQr?: boolean }) {
  return (
    <article className="rules">
      <header className="rules__head">
        <div>
          <p className="rules__kicker">SOONOT 진행 안내</p>
          <h1 className="rules__title">윷놀이 — 규칙과 진행 방법</h1>
          <p className="rules__lede">1부는 게임 규칙, 2부는 진행자가 화면에서 누를 순서입니다.</p>
        </div>
        {showQr ? (
          <aside className="rules__qr">
            <Qr text={rulesUrl()} size={104} />
            <p className="rules__qrCaption">스캔하면 휴대폰에서 열립니다 (비밀번호 없이)</p>
          </aside>
        ) : null}
      </header>

      {/* The 30-second version. Someone handed this five minutes before the event
          reads only this card; everything below is reference they look up mid-game. */}
      <section className="rules__quick" aria-label="처음이면 이것만">
        <h2 className="rules__quickTitle">처음이면 이것만</h2>
        <ol className="rules__quickList">
          <li>팀이 무대에서 <strong>윷을 던진다</strong></li>
          <li>나온 결과 <strong>도·개·걸·윷·모</strong>를 누른다</li>
          <li>움직일 <strong>말을 고른다</strong> — 모르겠으면 <strong>🏠 집에 더 가까움</strong></li>
          <li>미니게임·대결이 뜨면 <strong>룰렛</strong> → <strong>성공/실패</strong></li>
          <li>반복. 시간이 끝나면 <strong>순위 발표</strong></li>
        </ol>
        <p className="rules__quickFoot">아래는 전부 참고용입니다. 막히면 그때 찾아보세요.</p>
      </section>

      <nav className="rules__toc" aria-label="목차">
        <a href="#part1">1부 · 게임 규칙</a>
        <a href="#part2">2부 · 진행 순서</a>
        <a href="#minigames">미니게임 목록</a>
        <a href="#duels">1:1 대결 목록</a>
        <a href="#trouble">문제 해결</a>
      </nav>

      {/* ---- 1부: rules ---------------------------------------------------- */}
      <section className="rules__section" id="part1">
        <h2 className="rules__h2">1부 · 게임 규칙</h2>

        <p className="rules__big">
          팀끼리 번갈아 윷을 던져 말을 움직입니다. <strong>제한 시간 안에 집에 많이 들어간 팀이 이깁니다.</strong>
        </p>

        <h3 className="rules__h3">윷판</h3>
        <ul className="rules__list">
          <li><strong>대기</strong> — 출발 전 말이 있는 곳. 여기 말은 잡히지 않습니다.</li>
          <li><strong>갈림길</strong> — 모 · 뒷모 · 방(가운데). 지름길이 열리는 칸입니다.</li>
          <li><strong>집</strong> — 한 바퀴 완주. <strong>완주 1회로 기록되고 말은 대기로 돌아가 다시 돕니다.</strong></li>
        </ul>

        <h3 className="rules__h3">윷 던지기</h3>
        <p><strong>앱은 윷을 굴리지 않습니다.</strong> 무대에서 실제로 던지고, 진행자가 나온 결과를 누릅니다.</p>
        <table className="rules__table">
          <thead>
            <tr><th scope="col">결과</th><th scope="col">이동</th><th scope="col">한 번 더</th></tr>
          </thead>
          <tbody>
            {ROLLS.map((roll) => (
              <tr key={roll}>
                <th scope="row" className="rules__rollName">{roll}</th>
                <td>{ROLL_STEPS[roll]}칸</td>
                <td>{BONUS_ROLLS.includes(roll) ? <span className="rules__yes">예 ✓</span> : <span className="rules__no">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="rules__list">
          <li><strong>백도 없음</strong> — 말은 앞으로만 갑니다.</li>
          <li>칸이 남아 집을 지나쳐도 <strong>그대로 집</strong>에 들어갑니다 (딱 맞출 필요 없음).</li>
        </ul>

        <h3 className="rules__h3">지름길 — 가장 많이 틀리는 규칙</h3>
        <p className="rules__big">갈림길에 <strong>딱 멈췄을 때만</strong> 열립니다. <strong>지나가면 안 열립니다.</strong></p>
        <ul className="rules__list">
          <li><strong>모 · 뒷모</strong>에 딱 멈춤 → 다음 차례에 바깥 길 / 지름길 중 선택.</li>
          <li><strong>방</strong>(가운데)에 딱 멈춤 → 집으로 바로 빠지는 출구가 열립니다. 가장 빠른 길.</li>
        </ul>
        <p className="rules__note">선택지가 둘이면 화면이 <strong>🏠 집에 더 가까움</strong>을 표시해 줍니다.</p>

        <h3 className="rules__h3">잡기</h3>
        <ul className="rules__list">
          <li>상대 말과 <strong>같은 칸</strong>에 도착하면 잡습니다.</li>
          <li>잡힌 말은 <strong>대기로</strong> 돌아갑니다.</li>
          <li>잡은 팀은 <strong>한 번 더</strong> 던집니다 (여러 개를 잡아도 한 번).</li>
          <li><strong>대기 · 집</strong>에 있는 말은 못 잡습니다.</li>
        </ul>

        <h3 className="rules__h3">잡기 대표 대결 — 켰을 때만</h3>
        <p>잡기가 나오면 두 팀 <strong>대표 1명씩 1:1 대결</strong>을 합니다.</p>
        <ul className="rules__list">
          <li><strong>공격 팀 승</strong> → 잡기 성립. 상대 말은 대기로.</li>
          <li><strong>수비 팀 승</strong> → 잡기 취소. 공격한 말이 원래 자리로.</li>
          <li>이긴 팀 <strong>+1점</strong>.</li>
        </ul>

        <h3 className="rules__h3">미니게임 칸 — 켰을 때만</h3>
        <p>
          아래 <strong>{MINIGAME_STATIONS.length}개 칸</strong>에 딱 멈추면 룰렛이 미니게임을 뽑습니다.
          팀이 해보고 진행자가 성공/실패를 누릅니다.
        </p>
        <div className="rules__stations">
          {STATION_GROUPS.map((g) => (
            <div className="rules__stationGroup" key={g.label}>
              <h4 className="rules__stationLabel">{g.label}</h4>
              <p className="rules__stationNodes">
                {g.nodes.map((n) => (
                  <span className="rules__chip" key={n}>{n === 23 ? '방' : `${n}칸`}</span>
                ))}
              </p>
            </div>
          ))}
        </div>
        <table className="rules__table">
          <thead>
            <tr><th scope="col">판정</th><th scope="col">말</th><th scope="col">한 번 더</th><th scope="col">점수</th></tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row"><span className="rules__yes">성공</span></th>
              <td>그대로 (이동 인정)</td>
              <td>유지</td>
              <td>+1점</td>
            </tr>
            <tr>
              <th scope="row"><span className="rules__no">실패</span></th>
              <td><strong>한 칸만 뒤로</strong></td>
              <td>몰수</td>
              <td>없음</td>
            </tr>
          </tbody>
        </table>
        <p className="rules__note">실패해도 처음으로 돌아가지 않습니다. 한 칸만 물러나고 차례가 넘어갑니다.</p>

        <h3 className="rules__h3">순위</h3>
        <ol className="rules__ranked">
          <li><strong>완주 수</strong>가 많은 팀</li>
          <li>같으면 <strong>말이 더 많이 전진한</strong> 팀</li>
          <li>그래도 같으면 <strong>먼저 전진한</strong> 팀</li>
        </ol>
        <p className="rules__note">미니게임·대결 점수는 순위와 <strong>별개</strong>로 집계되어 화면에 표시됩니다.</p>

        <h3 className="rules__h3">게임이 끝나는 때</h3>
        <ul className="rules__list">
          <li><strong>시간 종료</strong> — 단, 하던 팀의 차례는 끝까지 합니다.</li>
          <li><strong>진행자가 종료를 누를 때</strong></li>
        </ul>
        <p className="rules__note">말이 계속 다시 도니까 <strong>“다 들어오면 끝”이 아닙니다.</strong> 시간으로 끊는 게임입니다.</p>
      </section>

      {/* ---- 2부: operator runbook ----------------------------------------- */}
      <section className="rules__section" id="part2">
        <h2 className="rules__h2">2부 · 진행 순서</h2>
        <p className="rules__big">화면에는 <strong>지금 누를 것만</strong> 나옵니다. 안 보이는 버튼은 아직 때가 아닌 것입니다.</p>

        <h3 className="rules__h3">시작하기 전에</h3>
        <ol className="rules__steps">
          <Step n={1} title="로그인하고 행사 만들기">
            <p><code>/master</code>에 비밀번호로 로그인 → 행사 제목 입력. 위쪽 바에 <strong>참여 코드</strong>와 QR이 나옵니다.</p>
          </Step>
          <Step n={2} title="발표 화면 띄우기">
            <p><strong>🖥 발표 화면 열기</strong> → 새 창을 프로젝터로 보내고 <strong>⛶</strong>로 전체화면.</p>
            <p className="rules__note">윷놀이가 안 보이면 위쪽 바 <strong>🖥 발표</strong>에서 <strong>윷놀이</strong>를 누르세요.</p>
          </Step>
          <Step n={3} title="팀 짜기">
            <ul className="rules__list">
              <li><strong>팀 이름</strong> — 한 줄에 하나. 최소 2팀, 중복 불가.</li>
              <li><strong>팀당 말</strong> — 1개 또는 2개 (팀이 많으면 1개가 빠름).</li>
              <li><strong>제한 시간</strong> — 기본 20분. 나중에 <strong>+5분</strong> 가능.</li>
              <li><strong>미니게임 켜기</strong> · <strong>잡기 대표 대결</strong> — 쓸 거면 체크.</li>
            </ul>
            <p className="rules__note">이 두 옵션은 <strong>시작 전에만</strong> 정할 수 있습니다.</p>
          </Step>
          <Step n={4} title="게임 시작">
            <p><strong>게임 시작</strong> → 시간이 흐르고 첫 팀 차례가 됩니다.</p>
          </Step>
        </ol>

        <h3 className="rules__h3">한 차례 — 계속 반복</h3>
        <ol className="rules__steps">
          <Step n={1} title="팀이 윷을 던진다">
            <p>화면에 <strong>“○○팀 차례”</strong>가 뜨면 무대에서 윷을 던지게 합니다.</p>
          </Step>
          <Step n={2} title="나온 결과를 누른다">
            <p><strong>도 · 개 · 걸 · 윷 · 모</strong> 중 나온 것을 누릅니다. 윷·모면 한 번 더 던집니다.</p>
          </Step>
          <Step n={3} title="움직일 말을 고른다">
            <p>선택지가 하나면 <strong>저절로 넘어갑니다.</strong> 둘 이상이면 눌러서 고릅니다.</p>
            <ul className="rules__list">
              <li><strong className="tag-ex tag-ex--fast">🏠 집에 더 가까움</strong> — 가장 빠른 길</li>
              <li><strong className="tag-ex tag-ex--capture">잡기 n</strong> — 상대 말 n개를 잡음</li>
              <li><strong className="tag-ex tag-ex--finish">골인</strong> — 집에 들어감 (완주 +1)</li>
            </ul>
            <p className="rules__note">어느 쪽을 고를지는 <strong>팀에게 물어보세요.</strong></p>
          </Step>
          <Step n={4} title="미니게임이 뜨면">
            <p><strong>룰렛 돌리기</strong> → 뽑힌 종목을 읽어주고 시킨다 → <strong>성공 ✓</strong> 또는 <strong>실패 ✗</strong>.</p>
          </Step>
          <Step n={5} title="잡기 대결이 뜨면">
            <p>대표 1명씩 나오게 → <strong>룰렛 돌리기</strong> → 대결 → <strong>이긴 팀</strong>을 누릅니다.</p>
            <p className="rules__note">대결 없이 그냥 잡으려면 <strong>건너뛰기</strong>.</p>
          </Step>
        </ol>

        <h3 className="rules__h3">마무리</h3>
        <ol className="rules__steps">
          <Step n={1} title="종료">
            <p>시간이 다 되면 자동 종료됩니다. 먼저 끝내려면 <strong>게임 종료</strong>.</p>
          </Step>
          <Step n={2} title="순위 발표">
            <p><strong>순위 발표</strong> → <strong>다음 (n/4)</strong>을 눌러 <strong>3등 → 2등 → 1등 → 전체</strong> 순으로 공개.</p>
            <p className="rules__note">발표를 시작하면 <strong>게임으로 못 돌아갑니다.</strong> 차례가 다 정리됐는지 먼저 확인하세요.</p>
          </Step>
        </ol>
      </section>

      {/* ---- 미니게임 목록 (from code) -------------------------------------- */}
      <section className="rules__section" id="minigames">
        <h2 className="rules__h2">미니게임 목록 · {MINI_GAMES.length}종</h2>
        <p>룰렛이 이 중 하나를 뽑습니다. 준비 화면에서 <strong>이름 | 설명</strong> 형식으로 고칠 수 있습니다.</p>
        <table className="rules__table rules__table--games">
          <thead>
            <tr>
              <th scope="col">종목</th>
              <th scope="col">하는 방법</th>
              <th scope="col">시간</th>
            </tr>
          </thead>
          <tbody>
            {MINI_GAMES.map((g) => (
              <tr key={g.id}>
                <th scope="row">{g.name}</th>
                <td>{g.instruction}</td>
                <td className="rules__secs">{g.seconds ? `${g.seconds}초` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---- 대결 목록 (from code) ------------------------------------------ */}
      <section className="rules__section" id="duels">
        <h2 className="rules__h2">1:1 대결 목록 · {DUEL_GAMES.length}종</h2>
        <p>잡기 대표 대결에서 룰렛이 뽑는 종목입니다.</p>
        <table className="rules__table rules__table--games">
          <thead>
            <tr>
              <th scope="col">종목</th>
              <th scope="col">승패 기준</th>
            </tr>
          </thead>
          <tbody>
            {DUEL_GAMES.map((g) => (
              <tr key={g.id}>
                <th scope="row">{g.name}</th>
                <td>{g.instruction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---- 문제 해결 ------------------------------------------------------ */}
      <section className="rules__section" id="trouble">
        <h2 className="rules__h2">문제가 생기면</h2>
        <dl className="rules__faq">
          <dt>잘못 눌렀다</dt>
          <dd><strong>되돌리기</strong> — 마지막 한 수가 통째로 취소됩니다 (잡힌 말도 원래대로). 여러 번 누르면 계속 뒤로 갑니다.</dd>

          <dt>잠깐 멈춰야 한다</dt>
          <dd><strong>일시정지</strong> → 다시 <strong>계속</strong>. 멈춘 시간은 제한 시간에서 빠지지 않습니다.</dd>

          <dt>시간이 부족하다</dt>
          <dd><strong>+5분</strong>. 여러 번 눌러도 됩니다.</dd>

          <dt>아무 버튼도 안 눌린다</dt>
          <dd>미니게임·대결이 떠 있으면 차례가 잠깁니다. <strong>성공/실패</strong>(또는 이긴 팀)를 눌러야 풀립니다.</dd>

          <dt>처음부터 다시 하고 싶다</dt>
          <dd>윷놀이 칸의 <strong>다시 하기</strong> — 윷놀이만 초기화됩니다 (빙고는 그대로). 행사 전체는 <strong>새 행사</strong>.</dd>

          <dt>발표 화면이 빙고를 보여준다</dt>
          <dd>위쪽 바 <strong>🖥 발표</strong> → <strong>윷놀이</strong>.</dd>

          <dt>화면이 끊겼다</dt>
          <dd>새로고침하면 됩니다. 게임 상태는 서버에 저장되어 그대로 돌아옵니다.</dd>
        </dl>
      </section>

      <footer className="rules__foot">
        <p>앱은 윷을 굴리지 않습니다. 무대에서 던지고 진행자가 누릅니다 — 최종 판정은 진행자에게 있습니다.</p>
      </footer>
    </article>
  );
}
