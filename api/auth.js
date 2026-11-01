import { auth } from './_lib/auth.js';

const handler = (request) => auth.handler(request);
export { handler as GET, handler as POST };
