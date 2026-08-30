'use strict';

(function exposeAnnotatedReportContract(root, factory) {
  const contract = factory(
    typeof module === 'object' && module.exports ? require('./report-contract-base') : root.pitchingReportContract,
    typeof module === 'object' && module.exports ? require('./annotation-model') : root.pitchingAnnotationModel,
  );
  if (typeof module === 'object' && module.exports) module.exports = contract;
  else root.pitchingReportContract = contract;
}(typeof globalThis === 'undefined' ? this : globalThis, (base, annotationModel) => {
  if (!base || typeof base.toReportDocument !== 'function') throw new Error('Base report contract is unavailable');
  if (!annotationModel || typeof annotationModel.normalizeAnnotations !== 'function') throw new Error('Annotation model is unavailable');

  function copyAnnotations(source, target) {
    if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return;
    const annotations = annotationModel.normalizeAnnotations(source.annotations);
    if (annotations.tracks.length > 0) target.annotations = annotations;
  }

  function addAnnotations(project, document) {
    const sourceSections = Array.isArray(project?.sections) ? project.sections : [];
    const outputSections = Array.isArray(document?.sections) ? document.sections : [];
    const sectionCount = Math.min(sourceSections.length, outputSections.length);
    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
      const sourceBlocks = Array.isArray(sourceSections[sectionIndex]?.blocks) ? sourceSections[sectionIndex].blocks : [];
      const outputBlocks = Array.isArray(outputSections[sectionIndex]?.blocks) ? outputSections[sectionIndex].blocks : [];
      const blockCount = Math.min(sourceBlocks.length, outputBlocks.length);
      for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
        const source = sourceBlocks[blockIndex];
        const target = outputBlocks[blockIndex];
        if (!source || !target || source.type !== target.type) continue;
        if (source.type === 'singleVideo') copyAnnotations(source, target);
        else if (source.type === 'comparisonVideo') {
          for (const side of ['left', 'right']) {
            if (target[side]) copyAnnotations(source?.[side], target[side]);
          }
        }
      }
    }
    return document;
  }

  function toReportDocument(project) {
    return addAnnotations(project, base.toReportDocument(project));
  }

  return Object.freeze({ ...base, toReportDocument });
}));
