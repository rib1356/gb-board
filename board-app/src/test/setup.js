import '@testing-library/jest-dom';

// jsdom doesn't implement scrolling; the app restores list scroll position.
window.scrollTo = () => {};
