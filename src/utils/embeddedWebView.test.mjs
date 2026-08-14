import assert from 'node:assert/strict'
import test from 'node:test'

import { isEmbeddedWebView } from './embeddedWebView.mjs'

test('detects an Android WebView user agent', () => {
  assert.equal(isEmbeddedWebView({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Device Build/ABC; wv) AppleWebKit/537.36 Version/4.0 Chrome/126.0 Mobile Safari/537.36',
    location: {}
  }), true)
})

test('does not classify mobile Chrome as an embedded WebView', () => {
  assert.equal(isEmbeddedWebView({
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
    location: {}
  }), false)
})

test('detects an Android shell that exposes a Chrome UA but reports a host safe area', () => {
  assert.equal(isEmbeddedWebView({
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
    location: {},
    safeAreaInsetTop: 48
  }), true)
})

test('supports an explicit embedded flag before or after the hash route', () => {
  assert.equal(isEmbeddedWebView({
    userAgent: '',
    location: { search: '?embedded=1', hash: '#/visualize' }
  }), true)
  assert.equal(isEmbeddedWebView({
    userAgent: '',
    location: { search: '', hash: '#/visualize?embedded=true' }
  }), true)
})
