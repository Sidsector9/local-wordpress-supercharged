/**
 * Mock module for @getflywheel/local/main.
 *
 * Jest's moduleNameMapper redirects all imports of '@getflywheel/local/main'
 * to this file. Every exported symbol that the addon's source code imports
 * from that module must be provided here as a jest.fn() or a suitable mock.
 */

export const getServiceContainer = jest.fn();

export const sendIPCEvent = jest.fn();

export const addIpcAsyncListener = jest.fn();
