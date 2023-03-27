

import '@testing-library/jest-dom';

// Use __mocks__/logger so calls to logger don't output to console, but
// console.log still works for debugging tests.
jest.mock('./logger');
