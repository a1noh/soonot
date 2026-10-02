/**
 * 윷놀이 규칙 + 진행 안내 — the handoff document (VBS 꿈당).
 *
 * The lists and numbers here are **imported from the engine**, never retyped:
 * `ROLL_STEPS`, `BONUS_ROLLS`, `MINIGAME_STATIONS`, `DUEL_GAMES` and `MINI_GAMES`
 * are the same values `apply.ts` reduces over, so this page cannot drift from the
 * rules the server actually enforces. Prose explains the flow; data fills the
 * tables.
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
const STATION_GROUPS: readonly { label: string; nodes: readonly number[]; note: string }[] = [
  { label: '바깥 길', nodes: MINIGAME_STATIONS.filter((n) => n <= 19), note: '모서리(갈림길)는 제외하고 한 칸씩 띄어서' },
  { label: '지름길', nodes: MINIGAME_STATIONS.filter((n) => n >= 21 && n !== 23), note: '대각선 길 각 갈래에 하나씩' },
  { label: '방 (가운데)', nodes: MINIGAME_STATIONS.filter((n) => n === 23), note: '판 정중앙' },
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
          <p className="rules__lede">
            이 문서만 보고도 윷놀이를 처음부터 끝까지 진행할 수 있도록 적었습니다.{' '}
            <strong>1부는 게임 규칙</strong>, <strong>2부는 진행자가 화면에서 누를 순서</strong>입니다.
          </p>
        </div>
        {showQr ? (
          <aside className="rules__qr">
            <Qr text={rulesUrl()} size={104} />
            <p className="rules__qrCaption">
              이 QR을 꿈당 리더 휴대폰으로 스캔하면 같은 문서가 열립니다 (참여 코드·비밀번호 없이).
            </p>
          </aside>
        ) : null}
      </header>

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

        <h3 className="rules__h3">한 줄 요약</h3>
        <p>
          팀끼리 번갈아 윷을 던져 말을 움직이고, <strong>집에 들어간 횟수(완주 수)가 많은 팀이 이깁니다.</strong>{' '}
          집에 들어간 말은 사라지지 않고 <strong>다시 대기로 돌아와 또 한 바퀴</strong>를 돕니다.
        </p>

        <h3 className="rules__h3">윷판</h3>
        <p>
          바깥을 한 바퀴 도는 <strong>20칸</strong>과, 가운데를 지나가는 <strong>지름길</strong>로 이루어진
          전통 29밭 윷판입니다. 말은 <strong>대기</strong>에서 출발해 바깥 길을 돌아 <strong>집</strong>으로 들어갑니다.
        </p>
        <ul className="rules__list">
          <li><strong>대기</strong> — 아직 판에 올라오지 않은 말이 있는 곳. 여기 있는 말은 <em>잡히지 않습니다.</em></li>
          <li><strong>갈림길</strong> — <strong>모</strong>, <strong>뒷모</strong>, <strong>방</strong>(가운데). 여기 서면 다음 차례에 길을 고를 수 있습니다.</li>
          <li><strong>집</strong> — 한 바퀴 완주. 완주 1회로 기록되고 말은 대기로 돌아옵니다.</li>
        </ul>

        <h3 className="rules__h3">윷 던지기</h3>
        <p>
          <strong>윷은 앱이 굴리지 않습니다.</strong> 무대에서 실제로 윷을 던지고,
          진행자가 나온 결과를 화면에서 눌러줍니다. 그래서 결과를 잘못 눌렀을 때를 대비한{' '}
          <strong>되돌리기</strong>가 있습니다 (2부 참고).
        </p>
        <table className="rules__table">
          <caption>윷 결과와 이동 칸 수</caption>
          <thead>
            <tr><th scope="col">결과</th><th scope="col">이동</th><th scope="col">한 번 더 던지기</th></tr>
          </thead>
          <tbody>
            {ROLLS.map((roll) => (
              <tr key={roll}>
                <th scope="row" className="rules__rollName">{roll}</th>
                <td>{ROLL_STEPS[roll]}칸</td>
                <td>{BONUS_ROLLS.includes(roll) ? <span className="rules__yes">예 ✓</span> : <span className="rules__no">아니오</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="rules__note">
          <strong>백도(뒤로 가기)는 없습니다.</strong> 말은 항상 앞으로만 갑니다.
        </p>

        <h3 className="rules__h3">지름길 — 가장 많이 틀리는 규칙</h3>
        <p>
          지름길은 <strong>갈림길 칸에 정확히 멈췄을 때만</strong> 열립니다.{' '}
          <strong>지나가면 열리지 않습니다.</strong>
        </p>
        <ul className="rules__list">
          <li>예를 들어 <strong>모</strong>에 딱 멈추면, 다음 차례에 <em>바깥 길</em>과 <em>지름길</em> 중에서 고릅니다.</li>
          <li><strong>방</strong>(가운데)에 딱 멈추면 집으로 바로 빠지는 출구가 열립니다 — 가장 빠른 길입니다.</li>
          <li>반대로 방을 <em>밟지 않고 그냥 지나가면</em> 그 출구는 열리지 않고 먼 길로 계속 갑니다.</li>
        </ul>
        <p className="rules__note">
          선택지가 두 개일 때는 화면이 <strong>🏠 집에 더 가까움</strong> 표시를 붙여줍니다.
          윷놀이를 잘 모르는 진행자도 그 표시만 보고 고를 수 있습니다.
        </p>
        <p>
          칸 수가 남아 집을 지나치게 되면 <strong>그대로 집에 들어갑니다</strong> (딱 맞게 던질 필요 없음).
        </p>

        <h3 className="rules__h3">잡기</h3>
        <p>
          내 말이 <strong>상대 말과 같은 칸</strong>에 도착하면 상대 말을 잡습니다.
        </p>
        <ul className="rules__list">
          <li>잡힌 말은 <strong>대기로 돌아갑니다</strong> (처음부터 다시).</li>
          <li>잡은 팀은 <strong>한 번 더 던집니다.</strong></li>
          <li>한 번에 말 여러 개를 잡아도 <strong>추가 던지기는 한 번뿐</strong>입니다.</li>
          <li><strong>대기</strong>와 <strong>집</strong>에 있는 말은 잡을 수 없습니다.</li>
        </ul>

        <h3 className="rules__h3">잡기 대표 대결 (방어전) — 켰을 때만</h3>
        <p>
          설정에서 이 옵션을 켜면, 잡기가 일어났을 때 바로 잡히지 않고{' '}
          <strong>두 팀 대표가 1:1 대결</strong>을 합니다. 화면에는 두 말이 같은 칸에서 만난 모습이 보입니다.
        </p>
        <ul className="rules__list">
          <li><strong>공격 팀 대표가 이기면</strong> → 잡기 성립. 상대 말은 대기로 갑니다.</li>
          <li><strong>수비 팀 대표가 이기면</strong> → 잡기 취소. 공격한 말이 <strong>원래 자리로 돌아갑니다.</strong></li>
          <li>이긴 팀은 <strong>1점</strong>을 얻습니다.</li>
        </ul>
        <p className="rules__note">종목은 룰렛이 아래 <a href="#duels">1:1 대결 목록</a>에서 하나를 뽑아줍니다.</p>

        <h3 className="rules__h3">미니게임 칸 — 켰을 때만</h3>
        <p>
          설정에서 미니게임을 켜면, 아래 칸에 <strong>정확히 멈출 때</strong> 차례가 멈추고
          룰렛이 미니게임 하나를 뽑습니다. 팀이 그 자리에서 해보고 진행자가 성공/실패를 판정합니다.
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
              <p className="rules__stationNote">{g.note}</p>
            </div>
          ))}
        </div>
        <p className="rules__note">
          미니게임 칸은 모두 <strong>{MINIGAME_STATIONS.length}곳</strong>입니다. 판 전체에 흩어져 있어서
          한 게임에 여러 번 걸립니다.
        </p>
        <table className="rules__table">
          <caption>미니게임 판정 결과</caption>
          <thead>
            <tr><th scope="col">판정</th><th scope="col">말</th><th scope="col">추가 던지기</th><th scope="col">점수</th></tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row"><span className="rules__yes">성공</span></th>
              <td>그 자리에 그대로 (이동 인정)</td>
              <td>있으면 그대로 유지</td>
              <td>+1점</td>
            </tr>
            <tr>
              <th scope="row"><span className="rules__no">실패</span></th>
              <td><strong>한 칸만 뒤로</strong> (처음 자리로 완전히 돌아가지는 않음)</td>
              <td>몰수</td>
              <td>없음</td>
            </tr>
          </tbody>
        </table>
        <p className="rules__note">
          실패해도 한 칸만 물러나기 때문에 게임이 끝없이 늘어지지 않습니다. 실패하면 차례가 다음 팀으로 넘어갑니다.
        </p>

        <h3 className="rules__h3">순위 정하기</h3>
        <p>집에 들어간 말이 다시 대기로 돌아오므로, 순위는 <strong>완주 횟수</strong>로 가립니다.</p>
        <ol className="rules__ranked">
          <li><strong>완주 수</strong>가 많은 팀이 위</li>
          <li>같으면 <strong>판 위 말들이 더 많이 전진한 팀</strong>이 위 (지름길도 공평하게 계산됩니다)</li>
          <li>그래도 같으면 <strong>먼저 전진했던 팀</strong>이 위</li>
          <li>마지막으로 팀을 등록한 순서</li>
        </ol>
        <p className="rules__note">
          미니게임·대결에서 얻은 점수는 <strong>따로 집계</strong>되어 화면에 표시됩니다.
        </p>

        <h3 className="rules__h3">게임이 끝나는 때</h3>
        <ul className="rules__list">
          <li><strong>제한 시간이 다 됐을 때</strong> — 단, <em>지금 하는 팀의 차례는 끝까지</em> 하고 종료됩니다.</li>
          <li><strong>진행자가 종료를 눌렀을 때</strong></li>
        </ul>
        <p className="rules__note">
          말이 집에 들어가도 다시 대기로 돌아오기 때문에, <strong>"모든 팀 완주"로는 끝나지 않습니다.</strong>{' '}
          시간을 정해두고 그 안에 많이 도는 게임입니다.
        </p>
      </section>

      {/* ---- 2부: operator runbook ----------------------------------------- */}
      <section className="rules__section" id="part2">
        <h2 className="rules__h2">2부 · 진행 순서 (화면에서 누를 것)</h2>
        <p className="rules__lede">
          아래 순서대로만 하면 됩니다. 화면에는 <strong>지금 눌러야 할 것만</strong> 나타나므로,
          보이지 않는 버튼은 아직 누를 때가 아닌 것입니다.
        </p>

        <h3 className="rules__h3">시작하기 전에</h3>
        <ol className="rules__steps">
          <Step n={1} title="행사 만들고 로그인">
            <p>
              진행자 화면(<code>/master</code>)에 비밀번호로 로그인하고 행사 제목을 입력합니다.
              위쪽 바에 <strong>참여 코드</strong> 4자리와 QR이 나옵니다.
            </p>
          </Step>
          <Step n={2} title="발표 화면 띄우기">
            <p>
              위쪽 바의 <strong>🖥 발표 화면 열기</strong>를 누르면 새 창이 열립니다.
              그 창을 프로젝터로 보내고 <strong>⛶</strong> 버튼으로 전체화면을 만듭니다.
            </p>
            <p className="rules__note">
              화면이 윷놀이를 안 보여주면 위쪽 바의 <strong>🖥 발표</strong>에서 <strong>윷놀이</strong>를 눌러 고정하세요.
            </p>
          </Step>
          <Step n={3} title="팀 짜기 (준비 중 화면)">
            <ul className="rules__list">
              <li><strong>팀 이름</strong> — 한 줄에 한 팀씩 적습니다. 최소 2팀, 이름이 겹치면 안 됩니다.</li>
              <li><strong>팀당 말</strong> — 1개 또는 2개. 팀이 많으면 1개가 빠릅니다.</li>
              <li><strong>제한 시간(분)</strong> — 기본 20분. 나중에 <strong>+5분</strong>으로 늘릴 수 있습니다.</li>
              <li><strong>미니게임 켜기</strong> — 켜면 미니게임 칸이 살아납니다. 목록도 그 자리에서 고칠 수 있습니다.</li>
              <li><strong>잡기 대표 대결</strong> — 켜면 잡을 때마다 1:1 대결이 붙습니다.</li>
            </ul>
            <p className="rules__note">
              두 옵션은 <strong>게임 시작 전에만</strong> 정할 수 있습니다. 바꾸려면 <strong>다시 하기</strong>로 준비 화면으로 돌아가야 합니다.
            </p>
          </Step>
          <Step n={4} title="게임 시작">
            <p><strong>게임 시작</strong>을 누르면 시간이 흐르기 시작하고 첫 팀 차례가 됩니다.</p>
          </Step>
        </ol>

        <h3 className="rules__h3">한 차례 돌리기 — 계속 반복</h3>
        <ol className="rules__steps">
          <Step n={1} title="팀이 실제로 윷을 던진다">
            <p>
              화면에 <strong>“○○팀 차례”</strong>와 <strong>“윷을 던진 결과를 눌러주세요”</strong>가 보입니다.
              무대에서 윷을 던지게 하세요.
            </p>
          </Step>
          <Step n={2} title="나온 결과를 누른다">
            <p>
              <strong>도 · 개 · 걸 · 윷 · 모</strong> 중 나온 것을 누릅니다.{' '}
              <strong>윷이나 모</strong>면 <strong>던질 횟수</strong>가 하나 늘어나 한 번 더 던집니다.
            </p>
          </Step>
          <Step n={3} title="움직일 말을 고른다">
            <p>
              <strong>“어느 말을 움직일까요?”</strong>가 나오면 선택지를 누릅니다.
              선택지가 하나뿐이면 이 단계는 <strong>저절로 넘어갑니다.</strong>
            </p>
            <p>선택지에 붙는 표시:</p>
            <ul className="rules__list">
              <li><strong className="tag-ex tag-ex--fast">🏠 집에 더 가까움</strong> — 가장 빠른 길. 잘 모르겠으면 이걸 고르면 됩니다.</li>
              <li><strong className="tag-ex tag-ex--capture">잡기 n</strong> — 상대 말 n개를 잡습니다 (한 번 더 던지게 됩니다).</li>
              <li><strong className="tag-ex tag-ex--finish">골인</strong> — 집에 들어갑니다 (완주 +1).</li>
            </ul>
            <p className="rules__note">
              빠른 길과 잡기 중 무엇을 고를지는 <strong>팀에게 물어보세요.</strong> 진행자가 임의로 고르지 않는 게 좋습니다.
            </p>
          </Step>
          <Step n={4} title="미니게임이 뜨면 — 룰렛 → 판정">
            <p>
              <strong>🎡 ○○팀 — 미니게임 칸!</strong>이 뜨면 차례가 멈춥니다.
            </p>
            <ol className="rules__inner">
              <li><strong>룰렛 돌리기</strong>를 누릅니다 (“두구두구…” 후 종목이 뽑힙니다).</li>
              <li>뽑힌 종목과 설명을 읽어주고 팀이 해봅니다. 시간 제한이 있으면 화면에 초가 셉니다.</li>
              <li><strong>성공 ✓</strong> 또는 <strong>실패 ✗</strong>를 누릅니다.</li>
            </ol>
            <p className="rules__note">
              판정하기 전에는 다른 버튼이 눌리지 않습니다. 꼭 성공/실패를 눌러서 차례를 풀어주세요.
            </p>
          </Step>
          <Step n={5} title="잡기 대결이 뜨면 — 이긴 팀을 누른다">
            <p>
              <strong>⚔️ 잡기! 대표 대결</strong>이 뜨면 두 팀에서 대표 1명씩 나오게 합니다.
            </p>
            <ol className="rules__inner">
              <li><strong>룰렛 돌리기</strong>로 대결 종목을 뽑습니다.</li>
              <li>대결을 시킵니다.</li>
              <li>
                <strong>공격 팀이 이겼으면</strong> “○○ 승 · 잡기 성공”,{' '}
                <strong>수비 팀이 이겼으면</strong> “○○ 승 · 수비 성공 🛡”를 누릅니다.
              </li>
            </ol>
            <p className="rules__note">
              대결을 생략하고 그냥 잡기로 처리하려면 <strong>건너뛰기 (그냥 잡기)</strong>를 누르세요.
            </p>
          </Step>
        </ol>

        <h3 className="rules__h3">마무리 — 순위 발표</h3>
        <ol className="rules__steps">
          <Step n={1} title="종료">
            <p>
              시간이 다 되면 <strong>지금 팀 차례가 끝난 뒤</strong> 자동으로 종료됩니다.
              먼저 끝내려면 <strong>게임 종료</strong>를 누릅니다.
            </p>
          </Step>
          <Step n={2} title="순위 발표 누르기">
            <p>
              <strong>순위 발표</strong>를 누르면 발표 화면이 “두구두구” 상태가 되고 잠시 뒤 3등부터 공개됩니다.
            </p>
          </Step>
          <Step n={3} title="다음 (n/4)로 한 단계씩">
            <p>
              <strong>3등 → 2등 → 1등 → 전체 보드</strong> 순서로 공개됩니다.
              진행자 화면의 순위 목록은 <strong>아래→위</strong> 순서로 공개되므로, 1등은 목록 맨 위에 있어도 가장 늦게 나옵니다.
            </p>
            <p className="rules__note">
              발표를 시작하면 <strong>게임으로 되돌아갈 수 없습니다.</strong> 발표 전에 꼭 모든 차례가 정리됐는지 확인하세요.
            </p>
          </Step>
        </ol>
      </section>

      {/* ---- 미니게임 목록 (from code) -------------------------------------- */}
      <section className="rules__section" id="minigames">
        <h2 className="rules__h2">미니게임 목록 · {MINI_GAMES.length}종</h2>
        <p className="rules__lede">
          룰렛이 이 중에서 하나를 뽑습니다. 진행자 화면의 <strong>준비 중</strong> 단계에서{' '}
          <strong>이름 | 설명</strong> 형식으로 자유롭게 고치거나 추가할 수 있습니다.
        </p>
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
        <p className="rules__lede">
          <strong>잡기 대표 대결</strong>에서 룰렛이 뽑는 종목입니다. 두 팀 대표 1명씩 나와서 한 판으로 가립니다.
        </p>
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
          <dt>결과를 잘못 눌렀다</dt>
          <dd>
            <strong>되돌리기</strong>를 누르세요. 아직 말을 고르지 않았다면 던진 결과만 취소되고,
            이미 움직였다면 <strong>마지막 한 수가 통째로 되돌아갑니다</strong> (잡힌 말도 원래 자리로).
            여러 번 누르면 계속 뒤로 갑니다.
          </dd>

          <dt>잠깐 멈춰야 한다 (안내·사진·정리)</dt>
          <dd>
            <strong>일시정지</strong> — 시간이 멈춥니다. 다시 <strong>계속</strong>을 누르면 이어집니다.
            멈춘 시간은 제한 시간에서 빠지지 않습니다.
          </dd>

          <dt>시간이 부족하다</dt>
          <dd><strong>+5분</strong>을 누르면 제한 시간이 5분 늘어납니다. 여러 번 눌러도 됩니다.</dd>

          <dt>미니게임 판정 화면에서 아무것도 안 눌린다</dt>
          <dd>
            정상입니다. 미니게임이 떠 있는 동안에는 차례가 <strong>잠겨</strong> 있습니다.{' '}
            <strong>성공</strong> 또는 <strong>실패</strong>(대결이면 이긴 팀)를 눌러야 풀립니다.
          </dd>

          <dt>처음부터 다시 하고 싶다</dt>
          <dd>
            윷놀이 칸 오른쪽 위의 <strong>다시 하기</strong> — 윷놀이만 준비 화면으로 돌아갑니다 (빙고는 그대로).
            행사 전체를 새로 시작하려면 위쪽 바의 <strong>새 행사</strong>를 누르세요.
          </dd>

          <dt>발표 화면이 빙고를 보여준다</dt>
          <dd>
            위쪽 바 <strong>🖥 발표</strong>에서 <strong>윷놀이</strong>를 누르면 윷놀이로 고정됩니다.{' '}
            <strong>자동</strong>은 진행 중인 게임을 따라 바뀝니다.
          </dd>

          <dt>화면이 끊겼거나 새로고침됐다</dt>
          <dd>
            그냥 새로고침하면 됩니다. 게임 상태는 <strong>서버에 저장</strong>되므로 판과 순위가 그대로 돌아옵니다.
          </dd>
        </dl>
      </section>

      <footer className="rules__foot">
        <p>
          윷은 앱이 굴리지 않습니다 — <strong>무대에서 던지고, 진행자가 결과를 눌러줍니다.</strong>{' '}
          그래서 모든 판정의 최종 권한은 진행자에게 있습니다.
        </p>
      </footer>
    </article>
  );
}
