import JoinPage from './join/page'

// Render the join page at root so visiting / and /join are identical.
// Server-side redirect() doesn't work in static export (no runtime server).
export default JoinPage
