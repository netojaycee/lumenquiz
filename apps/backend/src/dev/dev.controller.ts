import { Controller, HttpCode, Post } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

function randomCode(length = 6): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

@Controller('dev')
export class DevController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('seed')
  @HttpCode(200)
  async seed(): Promise<{ message: string; quizId: string; sessionCode: string }> {
    // Clean all existing data
    await this.prisma.audienceInteraction.deleteMany()
    await this.prisma.audienceTFAnswer.deleteMany()
    await this.prisma.audienceQuestionPrediction.deleteMany()
    await this.prisma.audienceRoundPrediction.deleteMany()
    await this.prisma.audienceMember.deleteMany()
    await this.prisma.teamAnswer.deleteMany()
    await this.prisma.sessionTeam.deleteMany()
    await this.prisma.session.deleteMany()
    await this.prisma.mCQOption.deleteMany()
    await this.prisma.question.deleteMany()
    await this.prisma.round.deleteMany()
    await this.prisma.teamMember.deleteMany()
    await this.prisma.team.deleteMany()
    await this.prisma.quiz.deleteMany()

    const quiz = await this.prisma.quiz.create({
      data: {
        name: 'Youth Sunday Bible Challenge 2024',
        description: 'Sample quiz for development',
        defaultAudienceLevel: 'medium',
        teams: {
          create: [
            // {
            //   name: 'Team Fire',
            //   color: '#EF4444',
            //   pin: '1111',
            //   joinCode: randomCode(8),
            //   members: { create: [{ name: 'John' }, { name: 'Ada' }] },
            // },
            // {
            //   name: 'Team Zion',
            //   color: '#3B82F6',
            //   pin: '2222',
            //   joinCode: randomCode(8),
            //   members: { create: [{ name: 'Samuel' }, { name: 'Mike' }] },
            // },
            {
              name: 'Razaq Rockstars',
              color: '#EF4444',
              pin: '1111',
              joinCode: randomCode(8),
              members: {
                create: [{ name: 'John' }, { name: 'Ada' }],
              },
            },
            {
              name: 'Gideon Guardians',
              color: '#3B82F6',
              pin: '2222',
              joinCode: randomCode(8),
              members: {
                create: [{ name: 'Samuel' }, { name: 'Mike' }],
              },
            },
            // {
            //   name: 'Emmanuel Warriors',
            //   color: '#22C55E',
            //   pin: '5841',
            //   members: {
            //     create: [{ name: 'Ruth' }, { name: 'Esther' }],
            //   },
            // },
          ],
        },
        rounds: {
          create: [
            {
              order: 1,
              name: 'Opening Round',
              gameMode: 'blitz',
              questionCount: 4,
              timerSeconds: 30,
              pointsPerQuestion: 10,
              audienceLevel: 'high',
              questions: {
                create: [
                  {
                    order: 1,
                    type: 'mcq',
                    text: 'Who was the first king of Israel?',
                    correctAnswer: 'B',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: 'David', isCorrect: false },
                        { label: 'B', text: 'Saul', isCorrect: true },
                        { label: 'C', text: 'Solomon', isCorrect: false },
                        { label: 'D', text: 'Samuel', isCorrect: false },
                      ],
                    },
                  },
                  {
                    order: 2,
                    type: 'open',
                    text: 'Name the shortest book in the Bible.',
                    correctAnswer: 'Obadiah',
                    aliases: JSON.stringify(['The Book of Obadiah']),
                    points: 10,
                    difficulty: 'medium',
                  },
                  {
                    order: 3,
                    type: 'mcq',
                    text: 'How many disciples did Jesus have?',
                    correctAnswer: 'B',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: '10', isCorrect: false },
                        { label: 'B', text: '12', isCorrect: true },
                        { label: 'C', text: '7', isCorrect: false },
                        { label: 'D', text: '14', isCorrect: false },
                      ],
                    },
                  },
                  {
                    order: 4,
                    type: 'mcq',
                    text: 'Who built the Ark?',
                    correctAnswer: 'A',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: 'Noah', isCorrect: true },
                        { label: 'B', text: 'Moses', isCorrect: false },
                        { label: 'C', text: 'Abraham', isCorrect: false },
                        { label: 'D', text: 'David', isCorrect: false },
                      ],
                    },
                  },
                  {
                    order: 5,
                    type: 'mcq',
                    text: 'Which book comes first in the Bible?',
                    correctAnswer: 'A',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: 'Genesis', isCorrect: true },
                        { label: 'B', text: 'Exodus', isCorrect: false },
                        { label: 'C', text: 'Leviticus', isCorrect: false },
                        { label: 'D', text: 'Matthew', isCorrect: false },
                      ],
                    },
                  },
                  {
                    order: 6,
                    type: 'open',
                    text: 'Who betrayed Jesus?',
                    correctAnswer: 'Judas Iscariot',
                    aliases: JSON.stringify(['Judas']),
                    points: 10,
                    difficulty: 'easy',
                  },
                  {
                    order: 7,
                    type: 'mcq',
                    text: 'How many days did God take to create the world?',
                    correctAnswer: 'B',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: '5', isCorrect: false },
                        { label: 'B', text: '6', isCorrect: true },
                        { label: 'C', text: '7', isCorrect: false },
                        { label: 'D', text: '8', isCorrect: false },
                      ],
                    },
                  },
                  {
                    order: 8,
                    type: 'mcq',
                    text: 'Who was swallowed by a great fish?',
                    correctAnswer: 'B',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: 'Elijah', isCorrect: false },
                        { label: 'B', text: 'Jonah', isCorrect: true },
                        { label: 'C', text: 'Peter', isCorrect: false },
                        { label: 'D', text: 'Paul', isCorrect: false },
                      ],
                    },
                  },
                  {
                    order: 9,
                    type: 'open',
                    text: 'What river was Jesus baptized in?',
                    correctAnswer: 'Jordan',
                    aliases: JSON.stringify(['River Jordan']),
                    points: 10,
                    difficulty: 'easy',
                  },
                  {
                    order: 10,
                    type: 'mcq',
                    text: 'Who led the Israelites out of Egypt?',
                    correctAnswer: 'A',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: 'Moses', isCorrect: true },
                        { label: 'B', text: 'Aaron', isCorrect: false },
                        { label: 'C', text: 'Joshua', isCorrect: false },
                        { label: 'D', text: 'Elijah', isCorrect: false },
                      ],
                    },
                  },
                ],
              },
            },
            {
              order: 2,
              name: 'Scripture Mastery',
              gameMode: 'tile_blitz',
              questionCount: 3,
              timerSeconds: 20,
              pointsPerQuestion: 10,
              bonusPointsPerQuestion: 5,
              audienceLevel: 'medium',
              questions: {
                create: [
                  {
                    order: 1,
                    type: 'mcq',
                    text: 'Who led the Israelites out of Egypt?',
                    correctAnswer: 'A',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: 'Moses', isCorrect: true },
                        { label: 'B', text: 'Aaron', isCorrect: false },
                        { label: 'C', text: 'Joshua', isCorrect: false },
                        { label: 'D', text: 'Elijah', isCorrect: false },
                      ],
                    },
                  },
                  {
                    order: 2,
                    type: 'open',
                    text: 'Which city did Jonah go to preach repentance?',
                    correctAnswer: 'Nineveh',
                    aliases: JSON.stringify(['City of Nineveh']),
                    points: 10,
                    difficulty: 'medium',
                  },
                  {
                    order: 3,
                    type: 'mcq',
                    text: 'Who was thrown into the lions’ den?',
                    correctAnswer: 'C',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: 'Joseph', isCorrect: false },
                        { label: 'B', text: 'David', isCorrect: false },
                        { label: 'C', text: 'Daniel', isCorrect: true },
                        { label: 'D', text: 'Paul', isCorrect: false },
                      ],
                    },
                  },
                  {
                    order: 4,
                    type: 'mcq',
                    text: 'Who received the Ten Commandments?',
                    correctAnswer: 'B',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: 'Abraham', isCorrect: false },
                        { label: 'B', text: 'Moses', isCorrect: true },
                        { label: 'C', text: 'Joshua', isCorrect: false },
                        { label: 'D', text: 'Aaron', isCorrect: false },
                      ],
                    },
                  },
                  {
                    order: 5,
                    type: 'open',
                    text: 'What city did God destroy with fire and brimstone?',
                    correctAnswer: 'Sodom',
                    aliases: JSON.stringify(['Sodom and Gomorrah']),
                    points: 10,
                    difficulty: 'easy',
                  },
                  {
                    order: 6,
                    type: 'mcq',
                    text: 'Who was known for his strength and long hair?',
                    correctAnswer: 'C',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: 'David', isCorrect: false },
                        { label: 'B', text: 'Samuel', isCorrect: false },
                        { label: 'C', text: 'Samson', isCorrect: true },
                        { label: 'D', text: 'Saul', isCorrect: false },
                      ],
                    },
                  },
                  {
                    order: 7,
                    type: 'open',
                    text: 'Who built the first temple in Jerusalem?',
                    correctAnswer: 'Solomon',
                    aliases: JSON.stringify(['King Solomon']),
                    points: 10,
                    difficulty: 'easy',
                  },
                  {
                    order: 8,
                    type: 'mcq',
                    text: 'Who was swallowed by a great fish?',
                    correctAnswer: 'A',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: 'Jonah', isCorrect: true },
                        { label: 'B', text: 'Moses', isCorrect: false },
                        { label: 'C', text: 'Elijah', isCorrect: false },
                        { label: 'D', text: 'Peter', isCorrect: false },
                      ],
                    },
                  },
                  {
                    order: 9,
                    type: 'open',
                    text: 'Who was the father of many nations?',
                    correctAnswer: 'Abraham',
                    aliases: JSON.stringify(['Abram']),
                    points: 10,
                    difficulty: 'easy',
                  },
                  {
                    order: 10,
                    type: 'mcq',
                    text: 'What sea did Moses part?',
                    correctAnswer: 'B',
                    aliases: '[]',
                    points: 10,
                    difficulty: 'easy',
                    options: {
                      create: [
                        { label: 'A', text: 'Dead Sea', isCorrect: false },
                        { label: 'B', text: 'Red Sea', isCorrect: true },
                        { label: 'C', text: 'Mediterranean Sea', isCorrect: false },
                        { label: 'D', text: 'Galilee Sea', isCorrect: false },
                      ],
                    },
                  },
                ],
              },
            },

            {
              order: 3,
              name: 'Ultimate Challenge',
              gameMode: 'ultimate_challenge',
              questionCount: 3,
              timerSeconds: 20,
              pointsPerQuestion: 15,
              audienceLevel: 'low',
              questions: {
                create: [
                  {
                    order: 1,
                    type: 'open',
                    text: 'Who was the father of Abraham?',
                    correctAnswer: 'Terah',
                    aliases: JSON.stringify(['Terah the father of Abram']),
                    points: 15,
                    difficulty: 'easy',
                  },
                  {
                    order: 2,
                    type: 'open',
                    text: 'How many books are in the New Testament?',
                    correctAnswer: '27',
                    aliases: JSON.stringify(['twenty-seven']),
                    points: 15,
                    difficulty: 'easy',
                  },
                  {
                    order: 3,
                    type: 'open',
                    text: 'Which prophet was taken up in a whirlwind?',
                    correctAnswer: 'Elijah',
                    aliases: JSON.stringify(['Prophet Elijah']),
                    points: 15,
                    difficulty: 'easy',
                  },
                  {
                    order: 4,
                    type: 'open',
                    text: 'Who interpreted dreams in Egypt and became second in command?',
                    correctAnswer: 'Joseph',
                    aliases: JSON.stringify(['Joseph of Egypt']),
                    points: 15,
                    difficulty: 'easy',
                  },
                  {
                    order: 5,
                    type: 'open',
                    text: 'What was the name of the giant killed by David?',
                    correctAnswer: 'Goliath',
                    aliases: JSON.stringify(['the Philistine giant Goliath']),
                    points: 15,
                    difficulty: 'easy',
                  },
                  {
                    order: 6,
                    type: 'open',
                    text: 'Which disciple walked on water with Jesus?',
                    correctAnswer: 'Peter',
                    aliases: JSON.stringify(['Simon Peter']),
                    points: 15,
                    difficulty: 'medium',
                  },
                  {
                    order: 7,
                    type: 'open',
                    text: 'What is the first book of the Bible?',
                    correctAnswer: 'Genesis',
                    aliases: JSON.stringify(['Book of Genesis']),
                    points: 15,
                    difficulty: 'easy',
                  },
                  {
                    order: 8,
                    type: 'open',
                    text: 'Who betrayed Jesus?',
                    correctAnswer: 'Judas Iscariot',
                    aliases: JSON.stringify(['Judas']),
                    points: 15,
                    difficulty: 'easy',
                  },
                  {
                    order: 9,
                    type: 'open',
                    text: 'How many days did God take to create the world?',
                    correctAnswer: '6',
                    aliases: JSON.stringify(['six days']),
                    points: 15,
                    difficulty: 'easy',
                  },
                  {
                    order: 10,
                    type: 'open',
                    text: 'What river was Jesus baptized in?',
                    correctAnswer: 'Jordan',
                    aliases: JSON.stringify(['River Jordan']),
                    points: 15,
                    difficulty: 'easy',
                  },
                ],
              },
            },

            {
              order: 4,
              name: 'Clue Reveal',
              gameMode: 'clue_reveal',
              questionCount: 5,
              timerSeconds: 20,
              pointsPerQuestion: 20,
              audienceLevel: 'high',
              questions: {
                create: [
                  {
                    order: 1,
                    type: 'open',
                    text: 'Who is this Biblical figure?',
                    correctAnswer: 'Moses',
                    aliases: JSON.stringify(['Moses the prophet']),
                    points: 20,
                    difficulty: 'medium',
                    clues: JSON.stringify([
                      'He was born in Egypt during a time of Hebrew oppression',
                      'He fled to Midian after killing an Egyptian',
                      'He spoke to God through a burning bush',
                      'He led Israel out of slavery through the Red Sea',
                    ]),
                  },
                  {
                    order: 2,
                    type: 'open',
                    text: 'Who is this Biblical king?',
                    correctAnswer: 'David',
                    aliases: JSON.stringify(['King David']),
                    points: 20,
                    difficulty: 'easy',
                    clues: JSON.stringify([
                      'He was the youngest son in his family',
                      'He worked as a shepherd before becoming king',
                      'He defeated a giant with a sling',
                      'He wrote many Psalms',
                    ]),
                  },
                  {
                    order: 3,
                    type: 'open',
                    text: 'Which city is this?',
                    correctAnswer: 'Jericho',
                    aliases: JSON.stringify(['City of Jericho']),
                    points: 20,
                    difficulty: 'medium',
                    clues: JSON.stringify([
                      'It is one of the oldest inhabited cities in the world',
                      'Its walls famously fell after being marched around',
                      'It was the first city conquered in Canaan',
                      'Joshua led the Israelites in its conquest',
                    ]),
                  },
                  {
                    order: 4,
                    type: 'open',
                    text: 'Who is this Biblical prophet?',
                    correctAnswer: 'Elijah',
                    aliases: JSON.stringify(['Prophet Elijah']),
                    points: 20,
                    difficulty: 'medium',
                    clues: JSON.stringify([
                      'He opposed the prophets of Baal',
                      'He performed miracles involving fire from heaven',
                      'He was fed by ravens in the wilderness',
                      'He was taken to heaven in a whirlwind',
                    ]),
                  },
                  {
                    order: 5,
                    type: 'open',
                    text: 'Who is this Biblical figure?',
                    correctAnswer: 'Joseph',
                    aliases: JSON.stringify(['Joseph of Egypt']),
                    points: 20,
                    difficulty: 'easy',
                    clues: JSON.stringify([
                      'He was sold by his brothers',
                      'He interpreted dreams in prison',
                      'He became second in command in Egypt',
                      'He stored grain during famine',
                    ]),
                  },
                  {
                    order: 6,
                    type: 'open',
                    text: 'Which Biblical figure is this?',
                    correctAnswer: 'Noah',
                    aliases: JSON.stringify(['Noah the ark builder']),
                    points: 20,
                    difficulty: 'easy',
                    clues: JSON.stringify([
                      'He lived before Abraham',
                      'He was chosen because he was righteous',
                      'He built a large boat by God’s instruction',
                      'He survived a global flood with his family and animals',
                    ]),
                  },
                  {
                    order: 7,
                    type: 'open',
                    text: 'Which mountain is this?',
                    correctAnswer: 'Mount Sinai',
                    aliases: JSON.stringify(['Sinai']),
                    points: 20,
                    difficulty: 'medium',
                    clues: JSON.stringify([
                      'It is located in the wilderness region',
                      'It was the place of divine revelation',
                      'Moses fasted there for 40 days',
                      'The Ten Commandments were given there',
                    ]),
                  },
                  {
                    order: 8,
                    type: 'open',
                    text: 'Who is this New Testament figure?',
                    correctAnswer: 'Paul',
                    aliases: JSON.stringify(['Apostle Paul', 'Saul of Tarsus']),
                    points: 20,
                    difficulty: 'medium',
                    clues: JSON.stringify([
                      'He originally persecuted Christians',
                      'He experienced a dramatic conversion on a road',
                      'He wrote many letters in the New Testament',
                      'He became a major missionary to the Gentiles',
                    ]),
                  },
                  {
                    order: 9,
                    type: 'open',
                    text: 'Which Biblical event is this?',
                    correctAnswer: 'The Exodus',
                    aliases: JSON.stringify(['Exodus from Egypt']),
                    points: 20,
                    difficulty: 'medium',
                    clues: JSON.stringify([
                      'It involved a mass departure of people',
                      'It included plagues on a major empire',
                      'It involved crossing a sea on dry ground',
                      'It marked Israel’s freedom from slavery in Egypt',
                    ]),
                  },
                  {
                    order: 10,
                    type: 'open',
                    text: 'Who is this Biblical figure?',
                    correctAnswer: 'Solomon',
                    aliases: JSON.stringify(['King Solomon']),
                    points: 20,
                    difficulty: 'easy',
                    clues: JSON.stringify([
                      'He succeeded his father as king of Israel',
                      'He asked God for wisdom instead of wealth',
                      'He is known for wise judgments between two mothers',
                      'He built the first temple in Jerusalem',
                    ]),
                  },
                ],
              },
            },
          ],
        },
      },
      include: { teams: true },
    })

    const sessionCode = randomCode()
    const quizWithTeams = quiz as typeof quiz & { teams: { id: string }[] }

    const session = await this.prisma.session.create({
      data: {
        quizId: quiz.id,
        sessionCode,
        status: 'lobby',
        sessionTeams: {
          create: quizWithTeams.teams.map((t) => ({ teamId: t.id })),
        },
      },
    })

    console.info(`[dev] Seeded quiz "${quiz.name}" session=${session.id} code=${sessionCode}`)

    return { message: 'Seeded successfully', quizId: quiz.id, sessionCode }
  }
}
