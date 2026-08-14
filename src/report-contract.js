'use strict';

(function exposeReportContract(root, factory) {
  const contract = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = contract;
  } else {
    root.pitchingReportContract = contract;
  }
}(typeof globalThis === 'undefined' ? this : globalThis, () => {
  function cloneBlock(block) {
    return {
      ...block,
      id: typeof block.id === 'string' ? block.id : '',
      type: typeof block.type === 'string' ? block.type : 'unknown',
      content: typeof block.content === 'string' ? block.content : '',
    };
  }

  function toReportDocument(project) {
    if (project === null || typeof project !== 'object' || Array.isArray(project)) {
      throw new Error('Project is required to build a report document');
    }
    return {
      schemaVersion: 1,
      title: typeof project.displayName === 'string' ? project.displayName : '',
      sections: Array.isArray(project.sections)
        ? project.sections.map((section) => ({
          id: typeof section.id === 'string' ? section.id : '',
          title: typeof section.title === 'string' ? section.title : '',
          blocks: Array.isArray(section.blocks) ? section.blocks.map(cloneBlock) : [],
        }))
        : [],
    };
  }

  return Object.freeze({ toReportDocument });
}));
