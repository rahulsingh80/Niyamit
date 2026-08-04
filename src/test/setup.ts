import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement these; stub them so exportService's download flow doesn't throw.
// Individual tests may still vi.spyOn() over these stubs.
if (!URL.createObjectURL) URL.createObjectURL = () => "blob:mock";
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

// jsdom doesn't implement matchMedia or ResizeObserver; App/components rely on both.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom doesn't implement layout, so scrollIntoView is missing.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
