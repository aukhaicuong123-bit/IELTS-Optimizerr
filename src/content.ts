import type { Passage } from './types'

export const passages: Passage[] = [
  {
    id: 'urban-gardens',
    title: 'Why urban gardens matter',
    level: 'B2',
    minutes: 12,
    kind: 'practice',
    text: `Cities are often warmer than surrounding rural areas because concrete and asphalt absorb sunlight. Urban gardens address this problem in several modest but useful ways. Plants shade surfaces, release water vapour and provide habitats for insects. Their effect is local rather than magical: a small garden cannot lower the temperature of an entire city. However, a network of gardens can improve comfort in the streets where people live and work.\n\nResearchers also point to a social benefit. When residents maintain a shared garden, they exchange knowledge and spend more time outdoors. This does not mean every garden succeeds. Projects are more likely to last when a group agrees on watering duties, chooses plants suited to the climate and measures progress realistically. The strongest projects therefore combine environmental action with a simple maintenance plan.`,
    questions: [
      {
        id: 'q1',
        type: 'multiple-choice',
        prompt: 'What is the main point of the passage?',
        options: [
          'Urban gardens solve every climate problem.',
          'Urban gardens offer local environmental and social benefits when planned well.',
          'Cities should replace all concrete with plants.',
          'Researchers disagree about urban gardens.'
        ],
        answer: 'Urban gardens offer local environmental and social benefits when planned well.',
        explanation: 'The passage describes local cooling, habitat and social benefits, then stresses realistic planning.',
        objective: 'Identify the main idea',
        objectiveId: 'identify-main-idea'
      },
      {
        id: 'q2',
        type: 'true-false-not-given',
        prompt: 'A single urban garden can cool an entire city.',
        options: ['True', 'False', 'Not Given'],
        answer: 'False',
        explanation: 'The text explicitly says a small garden cannot lower the temperature of an entire city.',
        objective: 'Distinguish explicit contradiction',
        objectiveId: 'distinguish-contradiction'
      },
      {
        id: 'q3',
        type: 'true-false-not-given',
        prompt: 'Successful projects always use plants native to the region.',
        options: ['True', 'False', 'Not Given'],
        answer: 'Not Given',
        explanation: 'The text says plants should be suited to the climate, but does not say they must be native.',
        objective: 'Recognise missing information',
        objectiveId: 'recognise-missing-info'
      },
      {
        id: 'q4',
        type: 'multiple-choice',
        prompt: 'Which factor does the passage associate with long-term success?',
        options: [
          'A large advertising budget',
          'A shared maintenance plan',
          'Removing all insects',
          'Building taller streets'
        ],
        answer: 'A shared maintenance plan',
        explanation: 'The final sentence links strong projects with environmental action and a simple maintenance plan.',
        objective: 'Locate supporting detail',
        objectiveId: 'locate-supporting-detail'
      }
    ]
  },
  {
    id: 'urban-gardens-retest',
    title: 'Retest: urban garden evidence',
    level: 'B2',
    minutes: 8,
    kind: 'retest',
    text: `A city garden is not a complete answer to urban heat, but it can make a measurable difference in its immediate surroundings. Vegetation shades hard surfaces, returns moisture to the air and creates small habitats. Several gardens connected across a neighbourhood may improve comfort, while one isolated plot should not be expected to cool the whole city.\n\nCommunity projects also depend on organisation. Residents need to share watering responsibilities, select climate-appropriate plants and decide how progress will be measured. These practical arrangements can determine whether an environmental idea lasts beyond its first season.`,
    questions: [
      {
        id: 'r1',
        type: 'multiple-choice',
        prompt: 'How does the passage describe the likely impact of one isolated garden?',
        options: [
          'It cools the whole city.',
          'It has a limited local effect.',
          'It has no environmental effect.',
          'It always fails without funding.'
        ],
        answer: 'It has a limited local effect.',
        explanation: 'The passage says one isolated plot should not be expected to cool the whole city.',
        objective: 'Identify the main idea',
        objectiveId: 'identify-main-idea'
      },
      {
        id: 'r2',
        type: 'true-false-not-given',
        prompt: 'One isolated garden is expected to cool an entire city.',
        options: ['True', 'False', 'Not Given'],
        answer: 'False',
        explanation: 'The passage explicitly says one isolated plot should not be expected to cool the whole city, contradicting this claim.',
        objective: 'Distinguish explicit contradiction',
        objectiveId: 'distinguish-contradiction'
      },
      {
        id: 'r3',
        type: 'true-false-not-given',
        prompt: 'The passage states that every project receives public funding.',
        options: ['True', 'False', 'Not Given'],
        answer: 'Not Given',
        explanation: 'Funding is not discussed; the passage focuses on organisation and maintenance.',
        objective: 'Recognise missing information',
        objectiveId: 'recognise-missing-info'
      },
      {
        id: 'r4',
        type: 'multiple-choice',
        prompt: 'What can determine whether a project lasts?',
        options: [
          'The height of nearby buildings',
          'Practical maintenance arrangements',
          'The number of insects present',
          'The age of the garden'
        ],
        answer: 'Practical maintenance arrangements',
        explanation: 'The final paragraph connects shared duties, plant choice and measurement with project longevity.',
        objective: 'Locate supporting detail',
        objectiveId: 'locate-supporting-detail'
      }
    ]
  },
  {
    id: 'community-libraries',
    title: 'Libraries and digital access',
    level: 'B2',
    minutes: 14,
    kind: 'practice',
    text: `Public libraries are changing as more information becomes available online. Their role is not simply to provide shelves of books. Many libraries now offer quiet workspaces, digital catalogues and workshops that help visitors evaluate sources. These services are particularly useful for people who have reliable internet access at home but lack guidance about which information to trust.\n\nThe change also creates practical challenges. Libraries must train staff, maintain equipment and design spaces for different kinds of users. A successful programme therefore combines technology with human support. Measuring attendance alone may show popularity, but feedback about whether visitors can use a new skill is more informative.`,
    questions: [
      {
        id: 'l1',
        type: 'multiple-choice',
        prompt: 'What change in libraries is emphasised?',
        options: [
          'They are removing all printed books.',
          'They combine information access with guidance and support.',
          'They only serve people without internet.',
          'They measure success only by attendance.'
        ],
        answer: 'They combine information access with guidance and support.',
        explanation: 'The passage describes digital services, workshops and human support rather than a simple shift away from books.',
        objective: 'Identify the main idea',
        objectiveId: 'identify-main-idea'
      },
      {
        id: 'l2',
        type: 'true-false-not-given',
        prompt: 'Every library visitor lacks internet access at home.',
        options: ['True', 'False', 'Not Given'],
        answer: 'False',
        explanation: 'The text says many useful services are for people who do have reliable internet access at home.',
        objective: 'Distinguish explicit contradiction',
        objectiveId: 'distinguish-contradiction'
      },
      {
        id: 'l3',
        type: 'true-false-not-given',
        prompt: 'The passage says attendance is the best measure of learning.',
        options: ['True', 'False', 'Not Given'],
        answer: 'False',
        explanation: 'It contrasts attendance with more informative feedback about whether a skill can be used.',
        objective: 'Distinguish explicit contradiction',
        objectiveId: 'distinguish-contradiction'
      },
      {
        id: 'l4',
        type: 'multiple-choice',
        prompt: 'What does a successful programme combine?',
        options: [
          'Technology and human support',
          'Popularity and advertising',
          'Books and silence',
          'Equipment and larger buildings'
        ],
        answer: 'Technology and human support',
        explanation: 'The final paragraph explicitly states that successful programmes combine technology with human support.',
        objective: 'Locate supporting detail',
        objectiveId: 'locate-supporting-detail'
      }
    ]
  }
]

export const practicePassages = passages.filter(p => p.kind !== 'retest')
export const retestPassages = passages.filter(p => p.kind === 'retest')
