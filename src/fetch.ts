// SPDX-License-Identifier: AGPL-3.0-or-later
import { connect } from 'cloudflare:sockets';
import { createFetcher } from '@pixel/socket-fetch';

export const fetch = createFetcher({
	connect,
	connectTls: (address) => connect(address, { secureTransport: 'on', allowHalfOpen: false }),
});
