import { PDFViewer } from "@react-pdf/renderer";
import { useSelector } from "react-redux";
import CertificateCom from "./CertificateCom";


const CertificateViewer = ({memberData={}}) => {
 
  return (
    <PDFViewer style={{ width: '100%', height: '100vh', border: 'none' }}>
      <CertificateCom data={memberData} />
    </PDFViewer>
  );
};

export default CertificateViewer;