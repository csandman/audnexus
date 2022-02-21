import Author from '../../models/Author'
import ScrapeHelper from '../../../helpers/authors/audibleScrape'
import SharedHelper from '../../../helpers/shared'
import lodash from 'lodash'

async function routes (fastify, options) {
    fastify.get('/authors/:asin', async (request, reply) => {
        // Query params
        const queryUpdateAuthor = request.query.update

        // First, check ASIN validity
        const commonHelpers = new SharedHelper()
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            throw new Error('Bad ASIN')
        }

        const dbProjection = {
            projection: {
                _id: 0,
                asin: 1,
                description: 1,
                genres: 1,
                image: 1,
                name: 1
            }
        }

        const { redis } = fastify
        const setRedis = (asin: string, newDbItem: any) => {
            redis.set(
                `author-${asin}`,
                JSON.stringify(newDbItem, null, 2)
            )
        }
        let findInRedis: string | undefined
        if (redis) {
            findInRedis = await redis.get(
                `author-${request.params.asin}`,
                (val: string) => {
                    return JSON.parse(val)
                }
            )
        }

        const findInDb = await Promise.resolve(
            Author.findOne({
                asin: request.params.asin
            }, dbProjection)
        )

        if (queryUpdateAuthor !== '0' && findInRedis) {
            return JSON.parse(findInRedis)
        } else if (queryUpdateAuthor !== '0' && findInDb) {
            if (redis) {
                redis.set(
                    `author-${request.params.asin}`,
                    JSON.stringify(findInDb, null, 2)
                )
            }
            return findInDb
        } else {
            // Set up helpers
            const scraper = new ScrapeHelper(request.params.asin)

            // Run fetch tasks in parallel/resolve promises
            const [scraperRes] = await Promise.all([scraper.fetchBook()])

            // Run parse tasks in parallel/resolve promises
            const [parseScraper] = await Promise.all([
                scraper.parseResponse(scraperRes)
            ])

            let newDbItem: any
            const updateAuthor = async () => {
                Promise.resolve(
                    Author.updateOne(
                        { asin: request.params.asin },
                        { $set: parseScraper }
                    )
                )

                // Find the updated item
                newDbItem = await Promise.resolve(
                    Author.findOne({ asin: request.params.asin }, dbProjection)
                )

                if (redis) {
                    setRedis(request.params.asin, newDbItem)
                }
            }

            // Update entry or create one
            if (queryUpdateAuthor === '0' && findInDb) {
                // If the objects are the exact same return right away
                if (lodash.isEqual(findInDb, parseScraper)) {
                    return findInDb
                }
                // Check state of existing author
                if (findInDb.genres) {
                    // Check state of incoming author
                    if (parseScraper.genres) {
                        // Only update if greater data in incoming author
                        if (
                            parseScraper.genres.length >= findInDb.genres.length
                        ) {
                            console.log(`Updating asin ${request.params.asin}`)
                            await updateAuthor()
                        } else {
                            return findInDb
                        }
                    }
                } else if (parseScraper.genres) {
                    // If no genres exist on author, but do on incoming, update
                    await updateAuthor()
                }
            } else {
                // Insert stitched data into DB
                newDbItem = await Promise.resolve(
                    Author.insertOne(parseScraper)
                )
                if (redis) {
                    setRedis(request.params.asin, newDbItem)
                }
            }
            return newDbItem
        }
    })
}

export default routes
