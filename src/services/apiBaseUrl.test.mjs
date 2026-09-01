import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isPublicVisualizePath,
  resolveRuntimeApiBaseUrl,
  routeRuntimeApiRequest
} from './apiBaseUrl.mjs';

test('uses the read-only public API for visualize routes', () => {
  for (const pathname of [
    '/visualize',
    '/visualize/',
    '/visualize/match-detail',
    '/visualize/team-detail'
  ]) {
    assert.equal(isPublicVisualizePath(pathname), true);
    assert.equal(resolveRuntimeApiBaseUrl(pathname), '/public-api');
  }
});

test('keeps protected application routes on the regular API', () => {
  for (const pathname of ['/', '/dashboard', '/data-manage', '/visualized']) {
    assert.equal(isPublicVisualizePath(pathname), false);
    assert.equal(resolveRuntimeApiBaseUrl(pathname), '/api');
  }
});

test('re-routes requests after navigating from public visualization to protected admin pages', () => {
  const publicRequest = routeRuntimeApiRequest({ baseURL: '/api', url: '/matches' }, '/visualize');
  assert.equal(publicRequest.baseURL, '/public-api');

  const protectedRequest = routeRuntimeApiRequest(publicRequest, '/dashboard');
  assert.equal(protectedRequest.baseURL, '/api');
  assert.equal(protectedRequest.url, '/matches');
});
