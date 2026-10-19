"use client";

import { useEffect, useState } from "react";

/**
 * 메인 진입 로딩 화면 — 로고 자체가 게이지다.
 *
 * 회색으로 깔린 로고 위에 검정 로고를 겹치고, 진행률만큼 왼쪽에서 오른쪽으로
 * 잉크가 번지듯 드러낸다("페이퍼"에 잉크가 채워지는 은유). 막대·스피너 없음.
 * 정적 연출 — 서버·데이터에 의존하지 않고 시간으로 채운다.
 *
 * 전체 새로고침(SSR) 때만 뜬다. App Router 내부 이동은 layout 이 재마운트되지 않는다.
 */

const LOGO_SRC = "/logo.png";   // public/logo.png (투명 PNG, 246×56)
const LOGO_W = 246;
const LOGO_H = 56;

const DURATION = 600;   // 게이지 0→100. hydration 직후부터 센다
const MIN_SHOW = 600;   // 이보다 짧으면 깜빡임처럼 보인다. DURATION 과 맞춘다
const FADE = 360;       // 사라지는 시간

function curve(t: number) {
    // 0~0.85 구간: 0→92 (감속), 0.85~1 구간: 92→100 (선형)
    if (t < 0.85) return 92 * (1 - Math.pow(1 - t / 0.85, 2.2));
    return 92 + 8 * ((t - 0.85) / 0.15);
}

export default function AppLoader() {
    const [pct, setPct] = useState(0);
    const [leaving, setLeaving] = useState(false);
    const [gone, setGone] = useState(false);

    useEffect(() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const dur = reduce ? 0 : DURATION;
        const fade = reduce ? 160 : FADE;

        let raf = 0;
        const start = performance.now();
        const tick = (now: number) => {
            const t = dur === 0 ? 1 : Math.min(1, (now - start) / dur);
            setPct(Math.round(curve(t)));
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        const show = reduce ? 0 : MIN_SHOW;
        const t1 = setTimeout(() => setLeaving(true), show);
        const t2 = setTimeout(() => setGone(true), show + fade);
        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, []);

    if (gone) return null;

    const scale = "min(1, calc((100vw - 64px) / 246px))"; // 375px 에서도 잘리지 않게

    return (
        <div
            aria-hidden
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 3000,                // 라이트박스 2100 위. 실측할 것
                background: "#f7f7f5",       // 종이. 흰색보다 한 톤 눌러 검정 로고가 앉는다
                display: "grid",
                placeItems: "center",
                opacity: leaving ? 0 : 1,
                transition: `opacity ${FADE}ms cubic-bezier(.4,0,.2,1)`,
                pointerEvents: leaving ? "none" : "auto",
            }}
        >
            <div
                style={{
                    display: "grid",
                    justifyItems: "end",
                    rowGap: 14,
                    transform: leaving ? "translateY(-6px)" : "translateY(0)",
                    transition: `transform ${FADE}ms cubic-bezier(.4,0,.2,1)`,
                }}
            >
                {/* 로고 = 게이지 */}
                <div
                    style={{
                        position: "relative",
                        width: LOGO_W,
                        height: LOGO_H,
                        transform: `scale(${scale})`,
                        transformOrigin: "center",
                    }}
                >
                    {/* 바닥: 아직 안 찬 부분 */}
                    <img
                        src={LOGO_SRC}
                        alt=""
                        draggable={false}
                        style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            opacity: 0.12,
                            userSelect: "none",
                        }}
                    />
                    {/* 위: 찬 부분. 왼쪽부터 드러난다 */}
                    <img
                        src={LOGO_SRC}
                        alt=""
                        draggable={false}
                        style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            clipPath: `inset(0 ${100 - pct}% 0 0)`,
                            transition: "clip-path 90ms linear",
                            userSelect: "none",
                        }}
                    />
                </div>

                {/* 숫자 하나. 로고 오른쪽 끝에 맞춘다 */}
                {/*<div*/}
                {/*    style={{*/}
                {/*        fontSize: 13,*/}
                {/*        lineHeight: 1,*/}
                {/*        fontVariantNumeric: "tabular-nums",*/}
                {/*        letterSpacing: "0.02em",*/}
                {/*        color: pct === 100 ? "#111" : "#9a9a96",*/}
                {/*        transition: "color 200ms",*/}
                {/*        transform: `scale(${scale})`,*/}
                {/*        transformOrigin: "right center",*/}
                {/*    }}*/}
                {/*>*/}
                {/*    {pct}*/}
                {/*    <span style={{ opacity: 0.6, marginLeft: 1 }}>%</span>*/}
                {/*</div>*/}
            </div>
        </div>
    );
}