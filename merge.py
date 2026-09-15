from pypdf import PdfWriter
merger = PdfWriter()
merger.append('Reflective_PPG_Formulas_and_Scientific_Validation.pdf')
merger.append('addendum.pdf')
merger.write('Reflective_PPG_Formulas_and_Scientific_Validation.pdf')
merger.close()
