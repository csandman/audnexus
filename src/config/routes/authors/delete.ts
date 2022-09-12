import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import AuthorDeleteHelper from '#helpers/routes/AuthorDeleteHelper'
import SharedHelper from '#helpers/utils/shared'

async function _delete(fastify: FastifyInstance) {
	fastify.delete<RequestGeneric>('/authors/:asin', async (request, reply) => {
		// Setup common helper first
		const sharedHelper = new SharedHelper()
		// First, check ASIN validity
		if (!sharedHelper.checkAsinValidity(request.params.asin)) {
			reply.code(400)
			throw new Error('Bad ASIN')
		}

		// Setup helper
		const { redis } = fastify
		const helper = new AuthorDeleteHelper(request.params.asin, redis)

		// Call helper handler
		const isHandled = await helper.handler()

		if (!isHandled) {
			reply.code(404)
			throw new Error(`${request.params.asin} not found in the database`)
		}

		return { message: `${request.params.asin} deleted` }
	})
}

export default _delete
