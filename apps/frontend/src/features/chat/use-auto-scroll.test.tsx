import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAutoScroll } from "./use-auto-scroll";

function Harness({ trigger }: { trigger: number }) {
  const { containerRef, contentRef, onScroll } = useAutoScroll(trigger);
  return (
    <div ref={containerRef} onScroll={onScroll} data-testid="scroller">
      <ul ref={contentRef} />
    </div>
  );
}

/** jsdom has no layout: give the scroller a fixed geometry and a plain scrollTop. */
function stubGeometry(element: HTMLElement, geometry: { scrollHeight: number; clientHeight: number }) {
  let scrollTop = 0;
  Object.defineProperty(element, "scrollHeight", { configurable: true, get: () => geometry.scrollHeight });
  Object.defineProperty(element, "clientHeight", { configurable: true, get: () => geometry.clientHeight });
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
}

function userScrollsTo(element: HTMLElement, top: number) {
  element.scrollTop = top;
  act(() => {
    element.dispatchEvent(new Event("scroll"));
  });
}

describe("useAutoScroll", () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    let resizeCallback: () => void = () => undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resizeCallback = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const geometry = { scrollHeight: 1000, clientHeight: 400 };
    const view = render(<Harness trigger={0} />);
    const scroller = screen.getByTestId("scroller");
    stubGeometry(scroller, geometry);
    return {
      scroller,
      geometry,
      newContent: (trigger: number) => view.rerender(<Harness trigger={trigger} />),
      contentGrows: () => act(() => resizeCallback()),
    };
  }

  it("follows new content and growth while pinned to the bottom", () => {
    const { scroller, geometry, newContent, contentGrows } = setup();

    newContent(1);
    expect(scroller.scrollTop).toBe(1000);

    geometry.scrollHeight = 1400; // streaming text grew the list
    contentGrows();
    expect(scroller.scrollTop).toBe(1400);
  });

  it("stops following when the user scrolls up more than 80 px", () => {
    const { scroller, geometry, newContent, contentGrows } = setup();
    newContent(1);

    userScrollsTo(scroller, 400); // 1000 - 400 - 400 = 200 px from the bottom
    geometry.scrollHeight = 1300;
    newContent(2);
    contentGrows();

    expect(scroller.scrollTop).toBe(400);
  });

  it("keeps following within 80 px of the bottom", () => {
    const { scroller, geometry, newContent } = setup();
    newContent(1);

    userScrollsTo(scroller, 530); // 1000 - 530 - 400 = 70 px from the bottom
    geometry.scrollHeight = 1300;
    newContent(2);

    expect(scroller.scrollTop).toBe(1300);
  });

  it("resumes following when the user scrolls back to the bottom", () => {
    const { scroller, geometry, newContent, contentGrows } = setup();
    newContent(1);
    userScrollsTo(scroller, 100);
    geometry.scrollHeight = 1200;
    contentGrows();
    expect(scroller.scrollTop).toBe(100);

    userScrollsTo(scroller, 800); // 1200 - 800 - 400 = 0 px from the bottom
    geometry.scrollHeight = 1500;
    contentGrows();

    expect(scroller.scrollTop).toBe(1500);
  });
});
